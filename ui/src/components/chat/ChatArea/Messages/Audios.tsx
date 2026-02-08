import type { AudioData } from '@/types/os'

export default function Audios({ audio }: { audio: AudioData[] }) {
  return (
    <div className="mt-2 space-y-2">
      {audio.map((a, i) => {
        const audioUrl = a.url || (a.base64_audio ? `data:${a.mime_type || 'audio/wav'};base64,${a.base64_audio}` : null)
        if (!audioUrl) return null
        return (
          <audio key={i} src={audioUrl} controls className="rounded" />
        )
      })}
    </div>
  )
}