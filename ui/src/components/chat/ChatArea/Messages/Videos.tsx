export default function Videos({ videos }: { videos: Array<{ url: string; alt?: string }> }) {
  return (
    <div className="mt-2 space-y-2">
      {videos.map((v, i) => (
        <video key={i} src={v.url} controls className="rounded" />
      ))}
    </div>
  )
}