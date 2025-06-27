import { useState } from 'react';

export default function Admin() {
  const [form, setForm] = useState({ title: '', price: '', description: '', image: '' });

  async function handleSubmit(e) {
    e.preventDefault();
    await fetch('/api/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    alert('Listing added!');
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Admin - Add Listing</h1>
      <form onSubmit={handleSubmit} className="flex flex-col space-y-2">
        <input placeholder="Title" className="border p-2 rounded" onChange={e=>setForm({...form, title:e.target.value})} />
        <input placeholder="Price" className="border p-2 rounded" onChange={e=>setForm({...form, price:e.target.value})} />
        <input placeholder="Image URL" className="border p-2 rounded" onChange={e=>setForm({...form, image:e.target.value})} />
        <textarea placeholder="Description" className="border p-2 rounded" onChange={e=>setForm({...form, description:e.target.value})} />
        <button className="bg-black text-white p-2 rounded">Save</button>
      </form>
    </div>
  );
}
