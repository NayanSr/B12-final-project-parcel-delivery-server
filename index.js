const express = require('express');
const cors= require('cors');
const app = express()
const port =process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
  res.send('Hello from percel delivery server!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
