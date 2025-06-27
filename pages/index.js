import Link from 'next/link';

export default function Home({ listings }) {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">Selling Dubai Luxury Marketplace</h1>
      <Link href="/admin">
        <button className="bg-black text-white rounded p-2">Admin Panel</button>
      </Link>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {listings.map((item) => (
          <div key={item._id} className="border rounded p-4 shadow">
            <img src={item.image} alt={item.title} className="w-full h-48 object-cover rounded" />
            <h2 className="text-xl font-semibold mt-2">{item.title}</h2>
            <p>{item.price}</p>
            <Link href={`/listing/${item._id}`} className="text-blue-500">View Details</Link>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function getServerSideProps() {
  const res = await fetch("http://localhost:3000/api/listings");
  const listings = await res.json();
  return { props: { listings } };
}
