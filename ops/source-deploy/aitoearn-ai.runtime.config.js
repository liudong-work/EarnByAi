process.env.NODE_ENV = process.env.NODE_ENV || 'production'
process.env.SERVER_URL = process.env.SERVER_URL || 'http://127.0.0.1:19082'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'change-this-jwt-secret'
process.env.INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || 'local-internal-token'
process.env.OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
process.env.GEMINI_KEY_PAIRS = process.env.GEMINI_KEY_PAIRS || '[]'

const config = require('../../project/aitoearn-backend/apps/aitoearn-ai/config/config')

function buildMongoUri() {
  const uri = process.env.MONGODB_URI
  if (uri)
    return uri

  const host = process.env.MONGODB_HOST || '127.0.0.1'
  const port = process.env.MONGODB_PORT || '27017'
  const username = process.env.MONGODB_USERNAME || ''
  const password = process.env.MONGODB_PASSWORD || ''

  if (username) {
    return `mongodb://${username}:${encodeURIComponent(password)}@${host}:${port}/?authSource=admin&directConnection=true`
  }

  return `mongodb://${host}:${port}`
}

const redisHost = process.env.REDIS_HOST || '127.0.0.1'
const redisPort = Number(process.env.REDIS_PORT || 6379)
const redisPassword = process.env.REDIS_PASSWORD || undefined
const assetsConfig = process.env.ASSETS_CONFIG ? JSON.parse(process.env.ASSETS_CONFIG) : undefined

config.port = Number(process.env.AI_PORT || 19081)
config.mongodb = {
  uri: buildMongoUri(),
  dbName: process.env.MONGODB_DB_NAME || 'aitoearn',
}
config.redis = {
  host: redisHost,
  port: redisPort,
  ...(redisPassword ? { password: redisPassword, username: 'default' } : {}),
}
config.redlock = {
  redis: {
    host: redisHost,
    port: redisPort,
    ...(redisPassword ? { password: redisPassword, username: 'default' } : {}),
  },
}
config.auth = {
  ...config.auth,
  secret: process.env.JWT_SECRET,
  internalToken: process.env.INTERNAL_TOKEN,
}
config.serverClient = {
  baseUrl: process.env.SERVER_URL,
  token: process.env.INTERNAL_TOKEN,
}

if (assetsConfig) {
  config.assets = assetsConfig
}

module.exports = config
