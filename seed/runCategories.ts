import dotenv from 'dotenv'
import { seedDefaultCategories } from './defaultCategories'
import Category from '../backend/src/models/Category'

dotenv.config()

async function runCategorySeed() {
  try {
    const mongoUri = process.env.MONGODB_URI
    if (!mongoUri) throw new Error('MONGODB_URI is required to seed categories.')
    await Category.db.openUri(mongoUri)
    await seedDefaultCategories()
    console.log('Default marketplace categories are ready.')
  } catch (error) {
    console.error('Could not seed marketplace categories:', error)
    process.exitCode = 1
  } finally {
    await Category.db.close()
  }
}

void runCategorySeed()
