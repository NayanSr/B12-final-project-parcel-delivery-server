//! grok sol
const dns = require('node:dns');

if (process.env.NODE_ENV !== 'production') {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
    console.log('Development mode: Using Google + Cloudflare DNS');
}
//! grok sol

const express = require('express');
const cors= require('cors');
require('dotenv').config();
const app = express();
const { MongoClient, ServerApiVersion } = require('mongodb');

const port =process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yo4en.mongodb.net/?appName=Cluster0`;
// console.log('URL:',uri)
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db= client.db('parcel_delivery_db');
    const parcelCollection= db.collection('parcels');

    // parcel api
    app.get('/parcels', async(req,res)=>{
      const query= {};
      const {email}= req.query;
      if(email){
        query.senderEmail=email
      }
      const result= await parcelCollection.find(query).toArray();
      res.send(result)

    })

    app.post('/parcels', async(req,res)=>{
      const parcel= req.body;
      const result= await parcelCollection.insertOne(parcel);
      res.send(result)
    })

    



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB✔");
  } finally {
    // Ensures that the client will close when you finish/error
    //! await client.close();
  }
}
run().catch(console.dir);
app.get('/', (req, res) => {
  res.send('Hello from percel delivery server!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`) 
})
