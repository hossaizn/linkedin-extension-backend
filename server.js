// Backend API Server for LinkedIn Search Everywhere
// Deploy this to Vercel, Railway, or any Node.js hosting platform

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Enhanced CORS middleware for extension compatibility
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow chrome extensions, firefox extensions, and localhost
    if (origin.startsWith('chrome-extension://') || 
        origin.startsWith('moz-extension://') || 
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow your extension specifically
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// ROOT ROUTE - This fixes the "Cannot GET /" error
app.get('/', (req, res) => {
  res.json({
    name: 'LinkedIn Search Everywhere API',
    status: 'running',
    version: '1.0.0',
    description: 'AI-powered content analysis for LinkedIn extensions',
    endpoints: {
      'GET /': 'API status and information',
      'GET /health': 'Health check endpoint',
      'POST /api/analyze-content': 'Analyze LinkedIn content and return suggestions'
    },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    openaiConfigured: !!process.env.OPENAI_API_KEY
  });
});

// Main content analysis endpoint
app.post('/api/analyze-content', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || content.length < 10) {
      return res.status(400).json({
        error: 'Content is required and must be at least 10 characters long'
      });
    }

    console.log(`Analyzing content (${content.length} chars):`, content.substring(0, 100));

    // Call OpenAI API
    const suggestions = await analyzeWithOpenAI(content);
    
    res.json({ 
      suggestions,
      timestamp: new Date().toISOString(),
      contentLength: content.length
    });

  } catch (error) {
    console.error('Analysis error:', error);
    
    if (error.message.includes('API key')) {
      res.status(500).json({ error: 'Service configuration error' });
    } else if (error.message.includes('rate limit')) {
      res.status(429).json({ error: 'Service temporarily busy, please try again' });
    } else {
      res.status(500).json({ error: 'Analysis temporarily unavailable' });
    }
  }
});

// OpenAI integration function
async function analyzeWithOpenAI(content) {
  // Check if OpenAI is available
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OpenAI API key not configured, using fallback suggestions');
    return generateFallbackSuggestions(content);
  }

  try {
    const { OpenAI } = require('openai');
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an intelligent LinkedIn discovery assistant. Analyze the LinkedIn post content and suggest 1-2 highly relevant, specific suggestions that would genuinely interest someone engaged with this content. 

Focus on what would keep users actively learning and networking ON LinkedIn. Prioritize:
1) Specific LinkedIn Learning courses
2) Targeted job searches  
3) Networking opportunities
4) LinkedIn events/groups

Return ONLY a JSON array. Each object needs "title" (specific, actionable) and "description" (why this is valuable). Make suggestions feel organic and valuable, not generic.

Example: [{"title":"Advanced SQL for Data Analysis","description":"Perfect next step if you are working with data - highly rated course with real projects"}]`
        },
        {
          role: 'user',
          content: `Analyze this LinkedIn content: "${content.substring(0, 400)}"`
        }
      ],
      max_tokens: 300,
      temperature: 0.3
    });

    let responseContent = response.choices[0].message.content.trim();
    
    // Clean up response
    responseContent = responseContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let suggestions;
    try {
      suggestions = JSON.parse(responseContent);
    } catch (parseError) {
      console.warn('JSON parse failed, using fallback suggestions');
      suggestions = generateFallbackSuggestions(content);
    }

    // Validate suggestions
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      suggestions = generateFallbackSuggestions(content);
    }

    // Ensure proper format and limit to 2
    suggestions = suggestions.slice(0, 2).map(suggestion => ({
      title: suggestion.title || "Professional Development",
      description: suggestion.description || "Explore related opportunities on LinkedIn"
    }));

    return suggestions;

  } catch (error) {
    console.error('OpenAI API error:', error);
    
    // Return fallback suggestions instead of failing
    return generateFallbackSuggestions(content);
  }
}

// Fallback suggestion generator
function generateFallbackSuggestions(content) {
  const contentLower = content.toLowerCase();
  const suggestions = [];

  // Smart keyword-based suggestions
  if (contentLower.includes('data') || contentLower.includes('analytics') || contentLower.includes('analysis')) {
    suggestions.push({
      title: 'Data Analytics Courses',
      description: 'Explore data science and analytics courses on LinkedIn Learning'
    });
  }

  if (contentLower.includes('marketing') || contentLower.includes('brand') || contentLower.includes('campaign')) {
    suggestions.push({
      title: 'Digital Marketing Resources',
      description: 'Find marketing professionals and learning resources'
    });
  }

  if (contentLower.includes('leadership') || contentLower.includes('management') || contentLower.includes('team')) {
    suggestions.push({
      title: 'Leadership Development',
      description: 'Connect with leaders and explore management courses'
    });
  }

  if (contentLower.includes('tech') || contentLower.includes('software') || contentLower.includes('developer')) {
    suggestions.push({
      title: 'Technology Skills',
      description: 'Discover the latest tech courses and connect with developers'
    });
  }

  // Default suggestions if no keywords match
  if (suggestions.length === 0) {
    suggestions.push(
      {
        title: 'Professional Development',
        description: 'Discover learning opportunities related to this topic'
      },
      {
        title: 'Network Growth',
        description: 'Connect with professionals in your field'
      }
    );
  }

  return suggestions.slice(0, 2);
}

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The endpoint ${req.originalUrl} does not exist`,
    availableEndpoints: {
      'GET /': 'API status and information',
      'GET /health': 'Health check',
      'POST /api/analyze-content': 'Analyze content'
    }
  });
});

// Global error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// For local development
if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 LinkedIn Search Everywhere API running on port ${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`OpenAI configured: ${!!process.env.OPENAI_API_KEY}`);
  });
}

// Export for Vercel
module.exports = app;