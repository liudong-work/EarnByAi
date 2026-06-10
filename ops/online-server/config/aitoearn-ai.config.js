const {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
} = process.env

const {
  MONGODB_HOST,
  MONGODB_PORT,
  MONGODB_USERNAME,
  MONGODB_PASSWORD,
} = process.env

const {
  JWT_SECRET,
  INTERNAL_TOKEN,
} = process.env

const {
  FEISHU_WEBHOOK_URL,
  FEISHU_WEBHOOK_SECRET,
} = process.env

const {
  VOLCENGINE_API_KEY,
  VOLCENGINE_ACCESS_KEY_ID,
  VOLCENGINE_SECRET_ACCESS_KEY,
  VOLCENGINE_VOD_SPACE_NAME,
  VOLCENGINE_URL_AUTH_PRIMARY_KEY,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  ANTHROPIC_BASE_URL,
  ANTHROPIC_API_KEY,
  GROK_API_KEY,
  GEMINI_API_KEY,
  GEMINI_BASE_URL,
  DASHSCOPE_API_KEY,
  DASHSCOPE_BASE_URL,
} = process.env

const {
  ASSETS_CONFIG,
} = process.env

const {
  GEMINI_KEY_PAIRS,
  GEMINI_LOCATION,
} = process.env

const {
  SERVER_URL,
} = process.env

const GPT_IMAGE_2_SIZES = [
  '1024x1024',
  '1536x1024',
  '1024x1536',
  '1408x1056',
  '1056x1408',
  '1360x1088',
  '1088x1360',
  '1536x864',
  '864x1536',
]

const GPT_IMAGE_2_ASPECT_RATIOS = ['1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16']

function parseGeminiKeyPairs() {
  if (!GEMINI_KEY_PAIRS) {
    throw new Error('GEMINI_KEY_PAIRS 环境变量必须配置')
  }

  try {
    return JSON.parse(GEMINI_KEY_PAIRS)
  }
  catch (e) {
    console.error('解析 GEMINI_KEY_PAIRS 失败:', e)
    throw new Error('GEMINI_KEY_PAIRS 格式错误')
  }
}

module.exports = {
  port: 3010,
  logger: {
    console: {
      enable: true,
      level: 'debug',
      pretty: false,
    },
    ...(FEISHU_WEBHOOK_URL
      ? {
          feishu: {
            enable: true,
            url: FEISHU_WEBHOOK_URL,
            secret: FEISHU_WEBHOOK_SECRET || '',
          },
        }
      : {}),
  },
  redis: {
    host: REDIS_HOST,
    port: Number(REDIS_PORT),
    username: 'default',
    password: REDIS_PASSWORD,
  },
  redlock: {
    redis: {
      host: REDIS_HOST,
      port: Number(REDIS_PORT),
      username: 'default',
      password: REDIS_PASSWORD,
    },
  },
  mongodb: {
    uri: `mongodb://${MONGODB_USERNAME}:${encodeURIComponent(MONGODB_PASSWORD)}@${MONGODB_HOST}:${MONGODB_PORT}/?authSource=admin&directConnection=true`,
    dbName: 'aitoearn',
  },
  auth: {
    secret: JWT_SECRET,
    expiresIn: 7 * 24 * 60 * 60,
    internalToken: INTERNAL_TOKEN,
  },
  serverClient: {
    baseUrl: SERVER_URL,
    token: INTERNAL_TOKEN,
  },
  assets: JSON.parse(ASSETS_CONFIG),
  ai: {
    volcengine: {
      baseUrl: 'https://ark.cn-beijing.volces.com/',
      apiKey: VOLCENGINE_API_KEY,
      accessKeyId: VOLCENGINE_ACCESS_KEY_ID,
      secretAccessKey: VOLCENGINE_SECRET_ACCESS_KEY,
      spaceName: VOLCENGINE_VOD_SPACE_NAME,
      playbackBaseUrl: 'http://vod.assets.aitoearn.ai',
      urlAuthPrimaryKey: VOLCENGINE_URL_AUTH_PRIMARY_KEY || '',
    },
    openai: {
      baseUrl: OPENAI_BASE_URL,
      apiKey: OPENAI_API_KEY,
    },
    grok: {
      baseUrl: 'https://api.x.ai',
      apiKey: GROK_API_KEY,
    },
    anthropic: {
      baseUrl: ANTHROPIC_BASE_URL,
      apiKey: ANTHROPIC_API_KEY,
    },
    gemini: {
      keyPairs: parseGeminiKeyPairs(),
      location: GEMINI_LOCATION || 'us-central1',
      apiKey: GEMINI_API_KEY,
      baseUrl: GEMINI_BASE_URL,
    },
    dashscope: {
      apiKey: DASHSCOPE_API_KEY || '',
      ...(DASHSCOPE_BASE_URL && { baseUrl: DASHSCOPE_BASE_URL }),
    },
    aideo: {
      vCreative: {
        basePrice: 0.1,
      },
      vision: {
        basePrice: 1.5,
      },
      highlight: {
        basePrice: 15,
      },
      aiTranslation: {
        facialTranslation: 100,
      },
      erase: {
        basePrice: 15,
      },
      videoEdit: {
        basePrice: 0.1,
      },
      dramaRecap: {
        basePrice: 200,
      },
      styleTransfer: {
        basePrice: 750,
      },
    },
    models: {
      chat: [
        {
          name: 'gemini-3.1-pro-preview',
          description: 'Gemini 3.1 Pro Preview',
          channel: 'gemini',
          scenes: ['web', 'comment', 'draft-generation'],
          inputModalities: ['text', 'image', 'audio', 'video'],
          outputModalities: ['text'],
          pricing: {
            tiers: [
              {
                maxInputTokens: 200000,
                input: { text: '0.2', image: '0.2', video: '0.2', audio: '0.7' },
                output: { text: '1.2' },
              },
              {
                input: { text: '0.4', image: '0.4', video: '0.4', audio: '1.05' },
                output: { text: '1.8' },
              },
            ],
          },
        },
        {
          name: 'gemini-3-flash-preview',
          description: 'Gemini 3 Flash Preview',
          channel: 'gemini',
          scenes: ['web', 'comment', 'draft-generation'],
          inputModalities: ['text', 'image', 'audio', 'video'],
          outputModalities: ['text'],
          pricing: {
            tiers: [
              {
                input: { text: '0.05', image: '0.05', video: '0.05', audio: '0.1' },
                output: { text: '0.3' },
              },
            ],
          },
        },
        {
          name: 'gemini-3.1-flash-image-preview',
          description: 'Nano Banana 2',
          tags: [{ 'en-US': 'Sale', 'zh-CN': '限时' }],
          channel: 'gemini',
          scenes: ['web'],
          inputModalities: ['text', 'image'],
          outputModalities: ['image'],
          fixedImagePricing: [
            { resolution: '1K', price: 4 },
            { resolution: '2K', price: 4 },
            { resolution: '4K', price: 7 },
          ],
          pricing: {
            tiers: [
              {
                input: { text: '0.1', image: '0.1' },
                output: { image: '0' },
              },
            ],
          },
        },
        {
          name: 'gpt-4.1-mini',
          description: 'GPT-4.1 mini',
          channel: 'openai',
          scenes: ['web', 'comment', 'draft-generation'],
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
          pricing: {
            tiers: [
              {
                input: { text: '0.4', image: '0.4' },
                output: { text: '1.6' },
              },
            ],
          },
        },
        {
          name: 'claude-sonnet-4-20250514',
          description: 'Claude Sonnet 4',
          channel: 'anthropic',
          scenes: ['web', 'comment', 'draft-generation'],
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
          pricing: {
            tiers: [
              {
                input: { text: '3' },
                output: { text: '15' },
              },
            ],
          },
        },
      ],
      image: [
        {
          name: 'gpt-image-1',
          description: 'GPT Image 1',
          channel: 'openai',
          scenes: ['web'],
          inputModalities: ['text', 'image'],
          outputModalities: ['image'],
          sizes: GPT_IMAGE_2_SIZES,
          aspectRatios: GPT_IMAGE_2_ASPECT_RATIOS,
          fixedImagePricing: [
            { resolution: '1K', price: 5 },
            { resolution: '2K', price: 7 },
            { resolution: '4K', price: 13 },
          ],
          pricing: {
            tiers: [
              {
                input: { text: '5', image: '10' },
                output: { image: '0' },
              },
            ],
          },
        },
      ],
      video: [],
      audio: [],
    },
  },
}
