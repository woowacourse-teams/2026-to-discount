export async function fetchBrands() {
  const res = await fetch('/api/brands')
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}
