const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const menuItemSchema = new Schema({
    name: { type: String, required: true },
    price: { type: String, required: true },
    calories: { type: String },
    description: { type: String },
    barcode: { type: String, required: false },
    discount: { type: Boolean, default: false, required: true },
    image: { type: String, required: false }
  });

  const menuSchema = new Schema({
    restaurantId: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    restaurantName: { type: String, required: true },
    menu: {
      type: Object,
      default: {},
    },
  }, { timestamps: true });

const Menu = mongoose.model('Menu', menuSchema);
module.exports = Menu;