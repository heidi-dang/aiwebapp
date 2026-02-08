export default function Images({ images }: { images: Array<{ url: string; alt?: string }> }) {
  return (
    <div className="mt-2 space-y-2">
      {images.map((img, i) => (
        <img key={i} src={img.url} alt={img.alt || 'image'} className="rounded" />
      ))}
    </div>
  )
}