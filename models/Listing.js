import mongoose from 'mongoose';

const ListingSchema = new mongoose.Schema({
  title: String,
  price: String,
  description: String,
  image: String,
});

export default mongoose.models.Listing || mongoose.model('Listing', ListingSchema);
