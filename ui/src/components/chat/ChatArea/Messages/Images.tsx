import Image from 'next/image'

const passthroughLoader = ({ src }: { src: string }) => src

export default function Images({ images }: { images: Array<{ url: string; alt?: string }> }) {
  return (
    <div className="mt-2 space-y-2">
      {images.map((img, i) => (
        <Image
          key={i}
          src={img.url}
          alt={img.alt || 'image'}
          width={1024}
          height={1024}
          className="h-auto w-full rounded"
          unoptimized
          loader={passthroughLoader}
        />
      ))}
    </div>
  )
}
