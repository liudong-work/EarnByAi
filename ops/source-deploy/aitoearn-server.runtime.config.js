process.env.NODE_ENV = process.env.NODE_ENV || 'production'
process.env.APP_DOMAIN = process.env.APP_DOMAIN || 'publish.xiechuangweilai.top'
process.env.AI_URL = process.env.AI_URL || 'http://127.0.0.1:19081'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'change-this-jwt-secret'
process.env.INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || 'local-internal-token'
process.env.SUPER_CODE = process.env.SUPER_CODE || '123456'

const config = require('../../project/aitoearn-backend/apps/aitoearn-server/config/config')

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

config.port = Number(process.env.SERVER_PORT || 19082)
config.environment = process.env.NODE_ENV
config.appDomain = process.env.APP_DOMAIN
config.auth.secret = process.env.JWT_SECRET
config.auth.internalToken = process.env.INTERNAL_TOKEN
config.superCode = process.env.SUPER_CODE
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
config.channel.channelDb = {
  uri: buildMongoUri(),
  dbName: process.env.MONGODB_CHANNEL_DB_NAME || 'aitoearn_channel',
}
config.aiClient = {
  baseUrl: process.env.AI_URL,
  token: process.env.INTERNAL_TOKEN,
}

if (assetsConfig) {
  config.assets = assetsConfig
}

if (!process.env.RELAY_SERVER_URL || !process.env.RELAY_API_KEY) {
  delete config.relay
}

module.exports = config
