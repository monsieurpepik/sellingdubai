
export default function Listing({ listing }) {
  return (
    <div className="container mx-auto p-4">
      <img src={listing.image} className="w-full h-96 object-cover rounded" />
      <h1 className="text-3xl font-bold mt-4">{listing.title}</h1>
      <p className="text-xl mt-2">{listing.price}</p>
      <p className="mt-4">{listing.description}</p>
      <form className="mt-4">
        <input type="text" placeholder="Your name" className="border p-2 rounded mr-2" />
        <input type="email" placeholder="Your email" className="border p-2 rounded mr-2" />
        <button className="bg-black text-white p-2 rounded">Request Info</button>
      </form>
    </div>
  );
}

export async function getServerSideProps(context) {
  const res = await fetch(`http://localhost:3000/api/listings/${context.params.id}`);
  const listing = await res.json();
  return { props: { listing } };
}
