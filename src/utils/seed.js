require('dotenv').config();
const mongoose = require('mongoose');
const { GiftCatalog } = require('../models/Gift');
const User = require('../models/User');

const GIFTS = [
  { id: 'rose',      emoji: '🌹', name: 'Red Rose',       cost: 50,  description: 'A classic love symbol' },
  { id: 'bouquet',   emoji: '💐', name: 'Bouquet',         cost: 120, description: 'Full bouquet of flowers' },
  { id: 'choco',     emoji: '🍫', name: 'Chocolates',      cost: 80,  description: 'Sweet Cadbury box' },
  { id: 'ring',      emoji: '💍', name: 'Gold Ring',       cost: 500, description: 'A sparkly virtual ring' },
  { id: 'necklace',  emoji: '📿', name: 'Necklace',        cost: 350, description: 'Beautiful pearl necklace' },
  { id: 'bracelet',  emoji: '🪬', name: 'Bracelet',        cost: 200, description: 'Charm bracelet' },
  { id: 'teddy',     emoji: '🧸', name: 'Teddy Bear',      cost: 150, description: 'Soft and cuddly' },
  { id: 'crown',     emoji: '👑', name: 'Crown',           cost: 750, description: 'For royalty only' },
  { id: 'star',      emoji: '⭐', name: 'Shining Star',    cost: 100, description: 'You are my star' },
  { id: 'cake',      emoji: '🎂', name: 'Birthday Cake',   cost: 180, description: 'Celebrate together' },
  { id: 'heart',     emoji: '💝', name: 'Heart Locket',    cost: 300, description: 'A locket full of love' },
  { id: 'letter',    emoji: '💌', name: 'Love Letter',     cost: 60,  description: 'Words from the heart' },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Seed gifts
  await GiftCatalog.deleteMany({});
  await GiftCatalog.insertMany(GIFTS);
  console.log(`✅ Seeded ${GIFTS.length} gifts`);

  // Create demo admin user
  const existing = await User.findOne({ username: 'admin_gu' });
  if (!existing) {
    await User.create({
      name: 'GU-Rizz Admin',
      username: 'admin_gu',
      personalEmail: 'admin@gurizz.com',
      password: 'Admin@123456',
      role: 'admin',
      isVibeComplete: true,
      isEmailVerified: true,
      color: '#c0132a',
      rizzPoints: 9999,
    });
    console.log('✅ Admin user created: admin_gu / Admin@123456');
  } else {
    console.log('ℹ️  Admin user already exists');
  }

  await mongoose.disconnect();
  console.log('\n🎉 Seed complete!');
}

seed().catch(err => { console.error(err); process.exit(1); });
