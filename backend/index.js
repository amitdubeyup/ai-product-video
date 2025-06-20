const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const { OpenAI } = require('openai');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

// Load environment variables
dotenv.config({ path: '../.env' });

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create necessary directories
const createDirectories = async () => {
  const dirs = ['./public', './public/images', './public/videos', './temp'];
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.log(`Directory ${dir} already exists or couldn't be created`);
    }
  }
};

// Product scraping functions
const scrapeShopify = async (url) => {
  try {
    console.log('Scraping Shopify URL:', url);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });
    
    const $ = cheerio.load(response.data);
    
    const product = {
      title: $('h1').first().text().trim() || 
             $('.product-title').text().trim() || 
             $('.product_title').text().trim() ||
             $('[data-testid="product-name"]').text().trim(),
      description: $('.product-description').text().trim() || 
                  $('.product-content').text().trim() ||
                  $('.product__description').text().trim() ||
                  $('.rte').text().trim(),
      price: $('.price').first().text().trim() || 
             $('.product-price').text().trim() ||
             $('.money').first().text().trim() ||
             $('[data-testid="price"]').text().trim(),
      images: [],
      features: []
    };

    // Extract images more comprehensively
    $('img').each((i, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src');
      if (src && (
        src.includes('product') || 
        src.includes('cdn.shopify') || 
        src.includes('shopifycdn')
      )) {
        const fullUrl = src.startsWith('//') ? 'https:' + src : 
                       src.startsWith('/') ? new URL(url).origin + src : src;
        if (fullUrl.includes('http')) {
          product.images.push(fullUrl);
        }
      }
    });

    // Extract features from various selectors
    $('ul li, .product-features li, .product__description ul li, .rte ul li').each((i, li) => {
      const feature = $(li).text().trim();
      if (feature && feature.length > 5 && feature.length < 100) {
        product.features.push(feature);
      }
    });

    // If no features found, try to extract from description
    if (product.features.length === 0 && product.description) {
      const sentences = product.description.split(/[.!?]/).filter(s => s.trim().length > 10);
      product.features = sentences.slice(0, 3).map(s => s.trim());
    }

    console.log('Scraped product:', {
      title: product.title,
      price: product.price,
      imageCount: product.images.length,
      featureCount: product.features.length
    });

    return product;
  } catch (error) {
    console.error('Shopify scraping error:', error.message);
    throw new Error('Failed to scrape Shopify product: ' + error.message);
  }
};

const scrapeAmazon = async (url) => {
  let browser;
  try {
    console.log('Scraping Amazon URL:', url);
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Set realistic browser headers
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    // Navigate with timeout
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait a bit for dynamic content to load
    await page.waitForTimeout(2000);

    const product = await page.evaluate(() => {
      // Try multiple selectors for title
      const title = document.querySelector('#productTitle')?.textContent?.trim() ||
                   document.querySelector('[data-automation-id="product-title"]')?.textContent?.trim() ||
                   document.querySelector('.product-title')?.textContent?.trim() ||
                   '';

      // Try multiple selectors for price
      const price = document.querySelector('.a-price-whole')?.textContent?.trim() ||
                   document.querySelector('.a-price .a-offscreen')?.textContent?.trim() ||
                   document.querySelector('#priceblock_dealprice')?.textContent?.trim() ||
                   document.querySelector('#priceblock_ourprice')?.textContent?.trim() ||
                   '';

      // Try multiple selectors for description
      const description = document.querySelector('#feature-bullets ul')?.textContent?.trim() ||
                         document.querySelector('#productDescription')?.textContent?.trim() ||
                         document.querySelector('.product-description')?.textContent?.trim() ||
                         '';

      // Extract images from multiple sources
      const imageSelectors = [
        '#altImages img',
        '#main-image',
        '.a-dynamic-image',
        '#landingImage'
      ];
      
      const images = [];
      imageSelectors.forEach(selector => {
        const imgs = Array.from(document.querySelectorAll(selector));
        imgs.forEach(img => {
          const src = img.src || img.dataset.src;
          if (src && src.includes('http') && !images.includes(src)) {
            images.push(src);
          }
        });
      });

      // Extract features from multiple sources
      const featureSelectors = [
        '#feature-bullets li span',
        '#feature-bullets li',
        '.a-unordered-list li',
        '#productDescription p'
      ];
      
      const features = [];
      featureSelectors.forEach(selector => {
        const elements = Array.from(document.querySelectorAll(selector));
        elements.forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.length > 5 && text.length < 200 && !features.includes(text)) {
            features.push(text);
          }
        });
      });

      return { 
        title, 
        price, 
        description: description.substring(0, 500), // Limit description length
        images: images.slice(0, 10), // Limit number of images
        features: features.slice(0, 10) // Limit number of features
      };
    });

    console.log('Scraped Amazon product:', {
      title: product.title,
      price: product.price,
      imageCount: product.images.length,
      featureCount: product.features.length
    });

    return product;
  } catch (error) {
    console.error('Amazon scraping error:', error.message);
    throw new Error('Failed to scrape Amazon product. This might be due to anti-bot measures or network issues: ' + error.message);
  } finally {
    if (browser) await browser.close();
  }
};

// OpenAI ad script generation
const generateAdScript = async (productData) => {
  try {
    const prompt = `Create a compelling 15-30 second video ad script for this product:
    
Title: ${productData.title}
Description: ${productData.description}
Price: ${productData.price}
Key Features: ${productData.features.slice(0, 3).join(', ')}

Requirements:
- Hook viewers in the first 3 seconds
- Highlight key benefits
- Include a clear call-to-action
- Keep it conversational and engaging
- Format as JSON with "hook", "body", "cta" fields
- Each section should be 1-2 sentences`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: parseInt(process.env.MAX_TOKENS) || 500,
      temperature: 0.7,
    });

    const script = JSON.parse(response.choices[0].message.content);
    return script;
  } catch (error) {
    console.error('OpenAI error:', error);
    throw new Error('Failed to generate ad script');
  }
};

// Download and process images with better error handling
const downloadImage = async (imageUrl, filename, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Downloading image (attempt ${attempt}/${retries}): ${imageUrl}`);
      
      const response = await axios({
        method: 'GET',
        url: imageUrl,
        responseType: 'stream',
        timeout: 15000, // 15 second timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        }
      });

      const filepath = path.join('./temp', filename);
      const writer = require('fs').createWriteStream(filepath);
      
      response.data.pipe(writer);
      
      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`Successfully downloaded: ${filename}`);
          resolve(filepath);
        });
        writer.on('error', reject);
      });
    } catch (error) {
      console.error(`Image download attempt ${attempt} failed:`, error.message);
      
      if (attempt === retries) {
        console.error('All download attempts failed for:', imageUrl);
        throw error;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
};

// Create a placeholder image when downloads fail
const createPlaceholderImage = async (filename, productTitle) => {
  try {
    const filepath = path.join('./temp', filename);
    
    // Create a simple colored rectangle as placeholder
    await sharp({
      create: {
        width: 1080,
        height: 1920,
        channels: 4,
        background: { r: 59, g: 130, b: 246, alpha: 1 } // Blue background
      }
    })
    .png()
    .toFile(filepath);
    
    console.log(`Created placeholder image: ${filename}`);
    return filepath;
  } catch (error) {
    console.error('Failed to create placeholder image:', error);
    throw error;
  }
};

// Video generation with FFmpeg
const generateVideo = async (productData, script, videoId) => {
  try {
    const outputPath = path.join('./public/videos', `${videoId}.mp4`);
    const tempDir = './temp';
    
    // Download and process images with fallback to placeholders
    const imageFiles = [];
    const maxImages = Math.min(3, productData.images?.length || 0);
    
    // If no images available, create placeholder images
    if (maxImages === 0) {
      console.log('No product images available, creating placeholder images');
      for (let i = 0; i < 3; i++) {
        const filename = `${videoId}_placeholder_${i}.png`;
        const filepath = await createPlaceholderImage(filename, productData.title);
        imageFiles.push(filepath);
      }
    } else {
      // Try to download real images, fallback to placeholders on failure
      for (let i = 0; i < maxImages; i++) {
        const filename = `${videoId}_img_${i}.jpg`;
        let filepath;
        
        try {
          filepath = await downloadImage(productData.images[i], filename);
          
          // Resize image to 1080x1920 (9:16 aspect ratio)
          const resizedPath = path.join(tempDir, `resized_${filename}`);
          await sharp(filepath)
            .resize(1080, 1920, { fit: 'cover', position: 'center' })
            .jpeg({ quality: 90 })
            .toFile(resizedPath);
          
          imageFiles.push(resizedPath);
        } catch (error) {
          console.log(`Failed to download image ${i}, creating placeholder instead`);
          const placeholderFilename = `${videoId}_placeholder_${i}.png`;
          const placeholderPath = await createPlaceholderImage(placeholderFilename, productData.title);
          imageFiles.push(placeholderPath);
        }
      }
      
      // Fill remaining slots with placeholders if needed
      while (imageFiles.length < 3) {
        const placeholderFilename = `${videoId}_placeholder_${imageFiles.length}.png`;
        const placeholderPath = await createPlaceholderImage(placeholderFilename, productData.title);
        imageFiles.push(placeholderPath);
      }
    }

    // Sanitize text for FFmpeg
    const sanitizeText = (text) => {
      if (!text) return '';
      return text
        .replace(/['"]/g, '') // Remove all quotes
        .replace(/[:\[\],;\\]/g, ' ') // Replace special chars with spaces
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim()
        .substring(0, 60); // Shorter text limit for better display
    };

    const hookText = sanitizeText(script.hook);
    const bodyText = sanitizeText(script.body);
    const ctaText = sanitizeText(script.cta);

    console.log('Generating video with FFmpeg...');
    console.log('Image files:', imageFiles);

    // Create video with FFmpeg using a simpler approach
    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      
      // Add images as input
      imageFiles.forEach((file, index) => {
        console.log(`Adding input ${index}: ${file}`);
        command.input(file).inputOptions(['-loop 1', '-t 3']);
      });

      // Use simpler text overlays without complex filters
      command
        .complexFilter([
          `[0:v]drawtext=text=${hookText}:fontsize=40:fontcolor=white:x=(w-text_w)/2:y=200:box=1:boxcolor=black@0.7:boxborderw=5[v0]`,
          `[1:v]drawtext=text=${bodyText}:fontsize=36:fontcolor=white:x=(w-text_w)/2:y=300:box=1:boxcolor=black@0.7:boxborderw=5[v1]`, 
          `[2:v]drawtext=text=${ctaText}:fontsize=38:fontcolor=yellow:x=(w-text_w)/2:y=400:box=1:boxcolor=black@0.8:boxborderw=5[v2]`,
          '[v0][v1][v2]concat=n=3:v=1:a=0[out]'
        ])
        .map('[out]')
        .outputOptions([
          '-c:v libx264',
          '-pix_fmt yuv420p',
          '-r 30',
          '-crf 23',
          '-preset fast'
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          console.log('Processing: ' + progress.percent + '% done');
        })
        .on('end', () => {
          console.log('Video generated successfully');
          // Clean up temporary files
          imageFiles.forEach(file => {
            fs.unlink(file).catch(err => console.log('Cleanup error:', err.message));
          });
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          console.error('FFmpeg stderr:', err.message);
          reject(err);
        })
        .run();
    });
  } catch (error) {
    console.error('Video generation error:', error);
    throw error;
  }
};

// API Routes
app.get('/', (req, res) => {
  res.json({ message: 'AI Video Ad Generator API' });
});

app.post('/api/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    let productData;
    
    if (url.includes('shopify') || url.includes('.myshopify.com')) {
      productData = await scrapeShopify(url);
    } else if (url.includes('amazon')) {
      productData = await scrapeAmazon(url);
    } else {
      return res.status(400).json({ error: 'Unsupported platform. Please use Shopify or Amazon URLs.' });
    }

    res.json({ success: true, data: productData });
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-script', async (req, res) => {
  try {
    const { productData } = req.body;
    
    if (!productData) {
      return res.status(400).json({ error: 'Product data is required' });
    }

    const script = await generateAdScript(productData);
    res.json({ success: true, script });
  } catch (error) {
    console.error('Script generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-video', async (req, res) => {
  try {
    const { productData, script } = req.body;
    
    if (!productData || !script) {
      return res.status(400).json({ error: 'Product data and script are required' });
    }

    const videoId = uuidv4();
    const videoPath = await generateVideo(productData, script, videoId);
    
    res.json({ 
      success: true, 
      videoUrl: `/videos/${videoId}.mp4`,
      videoId 
    });
  } catch (error) {
    console.error('Video generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize directories and start server
createDirectories().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('OpenAI API Key:', process.env.OPENAI_API_KEY ? 'Configured' : 'Missing');
  });
});
