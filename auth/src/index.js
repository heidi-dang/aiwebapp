import 'dotenv/config'
import dotenvExpand from 'dotenv-expand'
dotenvExpand.expand(dotenv.config({ path: '../../.env' }))

import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.AUTH_PORT || 4003

app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// Login page
app.get('/login', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'login.html')
  const isLocal = req.hostname.includes('localhost') || req.hostname.includes('127.0.0.1')
  let html = fs.readFileSync(filePath, 'utf8')
  if (isLocal) {
    html = html.replaceAll('{{APP_URL}}', 'http://localhost:4000')
  } else {
    const baseUrl = `${req.protocol}://${req.hostname}`
    const appUrl = baseUrl.replace(/^https:\/\/([^.]+\.)?/, 'https://app.')
    html = html.replaceAll('{{APP_URL}}', appUrl)
  }
  res.send(html)
})

// Signup/Register page
app.get('/signup', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'register.html')
  const isLocal = req.hostname.includes('localhost') || req.hostname.includes('127.0.0.1')
  let html = fs.readFileSync(filePath, 'utf8')
  if (isLocal) {
    html = html.replaceAll('{{APP_URL}}', 'http://localhost:4000')
  } else {
    const baseUrl = `${req.protocol}://${req.hostname}`
    const appUrl = baseUrl.replace(/^https:\/\/([^.]+\.)?/, 'https://app.')
    html = html.replaceAll('{{APP_URL}}', appUrl)
  }
  res.send(html)
})

// Redirect root to login
app.get('/', (req, res) => {
  res.redirect('/login')
})

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth', port: PORT })
})

app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`)
  console.log(`Login: http://localhost:${PORT}/login`)
  console.log(`Signup: http://localhost:${PORT}/signup`)
})