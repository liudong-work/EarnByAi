import { MongoClient } from 'mongodb'
import jwt from 'jsonwebtoken'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import crypto from 'crypto'

const MONGO_URI = process.env.MONGO_URI || 'mongodb://admin:password@mongodb:27017'
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-jwt-secret'
const DB_NAME = process.env.DB_NAME || 'aitoearn'
const TOKEN_PATH = process.env.AUTO_LOGIN_TOKEN_PATH || '/data/init/token.txt'
const DEFAULT_EMAIL = 'admin@aitoearn.local'

async function main() {
  const client = new MongoClient(MONGO_URI)
  await client.connect()

  const db = client.db(DB_NAME)
  const users = db.collection('user')

  let user = await users.findOne({ mail: DEFAULT_EMAIL, isDelete: { $ne: true } })

  if (!user) {
    const now = new Date()
    const result = await users.insertOne({
      name: 'Admin',
      mail: DEFAULT_EMAIL,
      status: 1,
      userType: 'CREATOR',
      isDelete: false,
      score: 0,
      usedStorage: 0,
      storage: { total: 524288000 },
      locale: 'en-US',
      createdAt: now,
      updatedAt: now,
    })
    user = { _id: result.insertedId, mail: DEFAULT_EMAIL, name: 'Admin' }

    const phoneHash = crypto
      .createHash('sha256')
      .update(DEFAULT_EMAIL)
      .digest('hex')
      .substring(0, 16)
    const combinedSalt = `aitoearn${phoneHash}`
    const hash = crypto
      .createHash('sha256')
      .update(user._id.toString())
      .update(combinedSalt)
      .digest('hex')
    const numericValue = parseInt(hash.substring(0, 6), 16)
    const code = numericValue
      .toString(36)
      .slice(-5)
      .toUpperCase()
      .padStart(5, '0')

    await users.updateOne({ _id: user._id }, { $set: { popularizeCode: code } })
  }

  const token = jwt.sign(
    { id: user._id.toString(), mail: user.mail, name: user.name },
    JWT_SECRET,
    { expiresIn: '100y' },
  )

  mkdirSync(dirname(TOKEN_PATH), { recursive: true })
  writeFileSync(TOKEN_PATH, token)

  await client.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
