import express from 'express'
import logger from 'morgan'
import dotenv from 'dotenv'
import { createClient } from '@libsql/client'

import { Server } from 'socket.io'
import { createServer } from 'node:http'

const port = process.env.PORT ?? 3000

const app = express()
const server = createServer(app)
const io = new Server(server)

dotenv.config()

const db = createClient({
  url: process.env.DB_URL,
  authToken: process.env.DB_TOKEN
})

// await db.execute('DROP TABLE IF EXISTS messages;')
await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    username INTEGER
  );`
)

io.on('connection', async (socket) => {
  console.log('a user has connected')

  socket.on('disconnect', () => {
    console.log('an user has disconnected')
  })

  socket.on('chat message', async (msg) => {
    console.log(msg)
    const userName = socket.handshake.auth.userName ?? 0
    let result
    try {
      result = await db.execute({
        sql: 'INSERT INTO messages (content, username) VALUES (:content, :username)',
        args: { content: msg, username: userName }
      })
    } catch (e) {
      console.error(e)
      return
    }

    io.emit('chat message', msg, result.lastInsertRowid.toString(), userName)
  })

  console.log(socket.handshake.auth)

  if (!socket.recovered) {
    try {
      const results = await db.execute({
        sql: 'SELECT id, content, username FROM messages WHERE id > ?',
        args: [socket.handshake.auth.serverOffset ?? 0]
      })
      results.rows.forEach(row => {
        socket.emit('chat message', row.content, row.id, row.username)
      })
    } catch (e) {
      console.error(e)
    }
  }
})

app.use(logger('dev'))

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/client/index.html')
})

server.listen(port, () => {
  console.log(`Server runnig on port ${port}`)
})
