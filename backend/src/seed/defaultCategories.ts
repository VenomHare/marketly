import Category from '../models/Category'

const DEFAULT_CATEGORIES = [
  { name: 'Electronics', slug: 'electronics' },
  { name: 'Fashion & Clothing', slug: 'fashion-clothing' },
  { name: 'Home & Kitchen', slug: 'home-kitchen' },
  { name: 'Beauty & Personal Care', slug: 'beauty-personal-care' },
  { name: 'Sports & Outdoors', slug: 'sports-outdoors' },
  { name: 'Books & Stationery', slug: 'books-stationery' },
  { name: 'Toys & Games', slug: 'toys-games' },
  { name: 'Grocery & Gourmet', slug: 'grocery-gourmet' },
  { name: 'Health & Wellness', slug: 'health-wellness' },
  { name: 'Automotive', slug: 'automotive' },
]

export async function seedDefaultCategories(): Promise<void> {
  await Category.bulkWrite(DEFAULT_CATEGORIES.map(category => ({
    updateOne: {
      filter: { slug: category.slug },
      update: { $setOnInsert: category },
      upsert: true,
    },
  })))
}
