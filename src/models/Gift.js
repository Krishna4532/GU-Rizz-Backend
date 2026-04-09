const mongoose = require('mongoose');

// ── GIFT CATALOG ──────────────────────────────────────────
const giftCatalogSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },  // 'rose', 'ring', etc.
  emoji:       { type: String, required: true },
  name:        { type: String, required: true },
  cost:        { type: Number, required: true },
  description: { type: String, default: '' },
  isActive:    { type: Boolean, default: true },
});

// ── GIFT TRANSACTION ──────────────────────────────────────
const giftTransactionSchema = new mongoose.Schema({
  senderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  giftId:      { type: String, required: true },   // ref to catalog id
  giftEmoji:   { type: String },
  giftName:    { type: String },
  cost:        { type: Number, required: true },
  message:     { type: String, default: '', maxlength: 200 },
}, { timestamps: true });

giftTransactionSchema.index({ recipientId: 1, createdAt: -1 });
giftTransactionSchema.index({ senderId: 1 });

const GiftCatalog     = mongoose.model('GiftCatalog', giftCatalogSchema);
const GiftTransaction = mongoose.model('GiftTransaction', giftTransactionSchema);

module.exports = { GiftCatalog, GiftTransaction };
