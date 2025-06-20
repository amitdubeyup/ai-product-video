import React, { useState } from 'react';
import axios from 'axios';
import ReactPlayer from 'react-player';
import './App.css';

const API_BASE_URL = 'http://localhost:5000';

function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [productData, setProductData] = useState(null);
  const [script, setScript] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');

  const handleScrape = async () => {
    if (!url) {
      setError('Please enter a product URL');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/scrape`, { url });
      setProductData(response.data.data);
      setStep(2);
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to scrape product data');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateScript = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/generate-script`, {
        productData
      });
      setScript(response.data.script);
      setStep(3);
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to generate script');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateVideo = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/generate-video`, {
        productData,
        script
      });
      setVideoUrl(`${API_BASE_URL}${response.data.videoUrl}`);
      setStep(4);
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to generate video');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setUrl('');
    setStep(1);
    setProductData(null);
    setScript(null);
    setVideoUrl('');
    setError('');
  };

  const downloadVideo = () => {
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = 'ai-generated-ad.mp4';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            AI Video Ad Generator
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Transform your product URLs into compelling video advertisements with AI-powered scripts and automated video generation.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-center space-x-4">
            {[1, 2, 3, 4].map((stepNum) => (
              <div key={stepNum} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${
                    step >= stepNum ? 'bg-blue-500' : 'bg-gray-300'
                  }`}
                >
                  {stepNum}
                </div>
                {stepNum < 4 && (
                  <div
                    className={`w-16 h-1 ${
                      step > stepNum ? 'bg-blue-500' : 'bg-gray-300'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-2">
            <div className="text-sm text-gray-500 grid grid-cols-4 gap-16">
              <span>Scrape Product</span>
              <span>Generate Script</span>
              <span>Create Video</span>
              <span>Download</span>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Step 1: URL Input */}
        {step === 1 && (
          <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8 fade-in">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">
              Enter Product URL
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product URL (Shopify or Amazon)
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.myshopify.com/products/sample-product"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="text-sm text-gray-500">
                <p>Supported platforms:</p>
                <ul className="list-disc list-inside mt-1">
                  <li>Shopify stores (*.myshopify.com)</li>
                  <li>Amazon product pages</li>
                </ul>
              </div>
              <button
                onClick={handleScrape}
                disabled={loading}
                className="w-full bg-blue-500 text-white font-semibold py-3 px-6 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition duration-200"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="loading-spinner mr-2"></div>
                    Scraping Product...
                  </div>
                ) : (
                  'Scrape Product Data'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Product Data Review */}
        {step === 2 && productData && (
          <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8 fade-in">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">
              Product Data Review
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-4">
                  Product Details
                </h3>
                <div className="space-y-3">
                  <div>
                    <span className="font-medium text-gray-600">Title:</span>
                    <p className="text-gray-800">{productData.title}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Price:</span>
                    <p className="text-gray-800">{productData.price}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Description:</span>
                    <p className="text-gray-800 text-sm">{productData.description?.substring(0, 200)}...</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Key Features:</span>
                    <ul className="list-disc list-inside text-sm text-gray-800">
                      {productData.features?.slice(0, 3).map((feature, index) => (
                        <li key={index}>{feature}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-4">
                  Product Images
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {productData.images?.slice(0, 4).map((image, index) => (
                    <img
                      key={index}
                      src={image}
                      alt={`Product ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-between mt-8">
              <button
                onClick={handleReset}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition duration-200"
              >
                Start Over
              </button>
              <button
                onClick={handleGenerateScript}
                disabled={loading}
                className="bg-blue-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition duration-200"
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="loading-spinner mr-2"></div>
                    Generating Script...
                  </div>
                ) : (
                  'Generate Ad Script'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Script Review */}
        {step === 3 && script && (
          <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-lg p-8 fade-in">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">
              Generated Ad Script
            </h2>
            <div className="space-y-6">
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">
                  Hook (0-3 seconds)
                </h3>
                <p className="text-gray-800">{script.hook}</p>
              </div>
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">
                  Body (3-25 seconds)
                </h3>
                <p className="text-gray-800">{script.body}</p>
              </div>
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">
                  Call to Action (25-30 seconds)
                </h3>
                <p className="text-gray-800">{script.cta}</p>
              </div>
            </div>
            <div className="flex justify-between mt-8">
              <button
                onClick={() => setStep(2)}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition duration-200"
              >
                Back
              </button>
              <button
                onClick={handleGenerateVideo}
                disabled={loading}
                className="bg-blue-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition duration-200"
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="loading-spinner mr-2"></div>
                    Creating Video...
                  </div>
                ) : (
                  'Generate Video'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Video Preview */}
        {step === 4 && videoUrl && (
          <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8 fade-in">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">
              Your AI-Generated Video Ad
            </h2>
            <div className="aspect-video bg-black rounded-lg overflow-hidden mb-6">
              <ReactPlayer
                url={videoUrl}
                width="100%"
                height="100%"
                controls={true}
                playing={false}
              />
            </div>
            <div className="flex justify-between">
              <button
                onClick={handleReset}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition duration-200"
              >
                Create Another Ad
              </button>
              <button
                onClick={downloadVideo}
                className="bg-green-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-green-600 transition duration-200"
              >
                Download Video
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
