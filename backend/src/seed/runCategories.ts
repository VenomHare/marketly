import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { seedDefaultCategories } from './defaultCategories'

dotenv.config()

async function runCategorySeed() {
  try {
    const mongoUri = process.env.MONGODB_URI
    if (!mongoUri) throw new Error('MONGODB_URI is required to seed categories.')
    await mongoose.connect(mongoUri)
    await seedDefaultCategories()
    console.log('Default marketplace categories are ready.')
  } catch (error) {
    console.error('Could not seed marketplace categories:', error)
    process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}

void runCategorySeed()
