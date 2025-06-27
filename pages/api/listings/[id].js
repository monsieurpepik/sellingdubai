import dbConnect from '../../../utils/dbConnect';
import Listing from '../../../models/Listing';

export default async function handler(req, res) {
  await dbConnect();
  const listing = await Listing.findById(req.query.id);
  res.json(listing);
}
