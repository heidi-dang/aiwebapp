'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'

type Particle = {
  id: string
  left: number
  size: number
  delay: number
  duration: number
  rotate: number
  color: string
}

export function ConfettiBurst({ seed }: { seed: string }) {
  const particles = useMemo<Particle[]>(() => {
    const colors = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#fb7185']
    const rand = (n: number) => {
      let h = 0
      for (let i = 0; i < n; i++) h = (h * 31 + seed.charCodeAt(i % seed.length)) >>> 0
      return h / 2 ** 32
    }
    const arr: Particle[] = []
    for (let i = 0; i < 36; i++) {
      const r = rand(i + 1)
      arr.push({
        id: `${seed}_${i}`,
        left: Math.floor(r * 100),
        size: 6 + Math.floor(rand(i + 7) * 6),
        delay: rand(i + 11) * 0.2,
        duration: 0.9 + rand(i + 17) * 0.7,
        rotate: -180 + rand(i + 23) * 360,
        color: colors[i % colors.length]
      })
    }
    return arr
  }, [seed])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -20, opacity: 0, rotate: 0 }}
          animate={{ y: 260, opacity: [0, 1, 1, 0], rotate: p.rotate }}
          transition={{ delay: p.delay, duration: p.duration, ease: 'easeOut' }}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color
          }}
          className="absolute top-0 rounded-sm"
        />
      ))}
    </div>
  )
}

