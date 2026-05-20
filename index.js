//! grok sol
const dns = require("node:dns");

if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
  console.log("Development mode: Using Google + Cloudflare DNS");
}
//! grok sol

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const { ObjectId } = require("mongodb");

const port = process.env.PORT || 3000;
const crypto = require("crypto");
const admin = require("firebase-admin");

const serviceAccount = require("./parcel-deliverye-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

function generateTrackingId() {
  const prefix = "PRCL";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random hex
  return `${prefix}-${date}-${random}`;
}

// middleware
app.use(express.json());
app.use(cors());

//* Custom Middleware
const verifyFBToken = async (req, res, next) => {
  // console.log('headers in the middleware', req.headers.authorization);
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "unathorized access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    // console.log('decoded in the token', decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yo4en.mongodb.net/?appName=Cluster0`;
// console.log('URL:',uri)
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("parcel_delivery_db");
    const userCollection = db.collection("users");
    const riderCollection = db.collection("riders");
    const parcelCollection = db.collection("parcels");
    const paymentCollection = db.collection("payments");

    //! middleware for protect user to allow admin activity
      //* must be use after verifyFBToken middleware for getting email

    const verifyAdmin=async(req,res,next)=>{
      const email= req.decoded_email;   //from verifyFBToken
      const query= {email};
      const user= await userCollection.findOne(query);

      if(!user || user.role !== 'admin'){
        return res.status(403).send({message:"Forbidden access"})
      }
next();
    }


    // Users related API
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      user.createdAt = new Date();
      const email = user.email;
      const isExist = await userCollection.findOne({ email });
      if (isExist) {
        return res.send({ message: "User already exist" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users",verifyFBToken, async (req, res) => {
      const searchText= req.query.searchText;
      const query={};
      if(searchText){
        // query.displayName= {$regex: searchText, $options: 'i'}
        query.$or=[
          {displayName:{$regex:searchText, $options:'i'}},
          {email:{$regex:searchText, $options:'i'}}
        ]
      }
      const cursor = userCollection.find(query).sort({createdAt:-1}).limit(5);
      const result = await cursor.toArray();
      res.send(result);
    });






      // GET user using id
    app.get('/users/:id', async(req,res)=>{
      const id= req.params.id;
      const query= {_id: new ObjectId(id)};
      const result= await userCollection.findOne(query);
      res.send.result;
    });
      // GET user using role
    app.get('/users/:email/role', async(req,res)=>{
      const email= req.params.email;
      const query={email};
      const user= await userCollection.findOne(query);
      res.send({role: user?.role || 'user'})

    })

    app.patch('/users/:id/role',verifyFBToken, verifyAdmin, async(req,res)=>{
      const id= req.params.id;
      const roleInfo= req.body;
      const query= {_id: new ObjectId(id)};
      const updatedDoc={
        $set:{role:roleInfo.role}
      };
      const result= await userCollection.updateOne(query,updatedDoc);
      res.send(result)
    })

    // parcel api
    app.get("/parcels", async (req, res) => {
      const query = {};
      const { email, deliveryStatus } = req.query;
      if (email) {
        query.senderEmail = email;
      }
      if(deliveryStatus){
        query.deliveryStatus= deliveryStatus
      }
      const options = { sort: { createdAt: -1 } };
      const cursor = parcelCollection.find(query, options);
      const result = await cursor.toArray();

      res.send(result);
    });

    app.get("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelCollection.findOne(query);
      res.send(result);
    });

    app.post("/parcels", async (req, res) => {
      const parcel = req.body;
      parcel.createdAt = new Date();
      const result = await parcelCollection.insertOne(parcel);
      res.send(result);
    });

    app.patch('/parcels/:id', async(req,res)=>{
      const id= req.params.id;
      const query= {_id: new ObjectId(id)};
      const {riderId, riderEmail,riderName, parcelId}=req.body;

      const updatedDoc={
        $set:{
          deliveryStatus: "rider_assgined",
          riderId:riderId,
          riderName:riderName,
          riderEmail: riderEmail
        }
      }

      const result= await parcelCollection.updateOne(query,updatedDoc);

      //Update rider info
      const riderQuery= {_id: new ObjectId(riderId)};
      const riderUpdareDoc= {
        $set:{
          workStatus:'engaged'
        }
      }
      const riderResult= await riderCollection.updateOne(riderQuery, riderUpdareDoc);
      res.send(riderResult)
    })

    /* 
     riderId: rider._id,
      riderEmail:rider.email,
      riderName: rider.name,
      parcelId: selectedParcel._id
    */


    app.delete("/parcels/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };
      const result = await parcelCollection.deleteOne(query);
      res.send(result);
    });

    //! Stripe Payment API

    //? Updated  in my parcel page
    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: `Please pay for : ${paymentInfo.parcelName}`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          parcelId: paymentInfo.parcelId,
          parcelName: paymentInfo.parcelName,
        },
        customer_email: paymentInfo.senderEmail,

        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-canceled`,
      });
      res.send({ url: session.url });
    });

    //* Old in payment page
    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, price_1234) of the product you want to sell
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: paymentInfo.parcelName,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.senderEmail,
        mode: "payment",
        metadata: { parcelId: paymentInfo.parcelId },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-canceled`,
      });
      console.log(session);
      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // Preventing multiple post in payment entry in db
      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };
      const paymentExist = await paymentCollection.findOne(query);
      if (paymentExist) {
        return res.send({
          message: "Already exists",
          transactionId,
          trackingId: paymentExist.trackingId,
        });
      }

      const trackingId = generateTrackingId();

      // console.log("session retrive :", session);
      if (session.payment_status === "paid") {
        const id = session.metadata.parcelId;
        const query = { _id: new ObjectId(id) };

        const update = {
          $set: {
            paymentStatus: "paid",
            deliveryStatus:"pending-pickup",
            trackingId: trackingId,
          },
        };
        const result = await parcelCollection.updateOne(query, update);
        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          parcelId: session.metadata.parcelId,
          parcelName: session.metadata.parcelName,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId: trackingId,
        };
        if (session.payment_status === "paid") {
          const resultPayment = await paymentCollection.insertOne(payment);
          return res.send({
            success: true,
            modifyParcel: result,
            trackingId: trackingId,
            paymentInfo: resultPayment,
            transactionId: session.payment_intent,
          });
        }
      }
      res.send({ success: false });
    });

    // Payment related
    app.get("/payments", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {};

      if (email) {
        query.customerEmail = email;

        // Check email address
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "forbidden access" });
        }
      }
      const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    //* riders api

    app.get("/riders", async (req, res) => {
      const {status, district, workStatus}= req.query;
      const query = {};
      // console.log(req.query)
      if (status) {
        query.status = status;
      }
      if(district){
        query.district=district
      }
      if(workStatus){
        query.workStatus= workStatus
      }
      const cursor = riderCollection.find(query);
      const result = await cursor.toArray();
      // console.log("All riders", result, "QUERY", query)
      res.send(result);
    });



    app.post("/riders", async (req, res) => {
      const rider = req.body;
      rider.status = "pending";
      rider.createdAt = new Date();
      const result = await riderCollection.insertOne(rider);
      res.send(result);
    });

   app.patch('/riders/:identification',verifyFBToken, verifyAdmin, async(req,res)=>{
    const id= req.params.identification;
    const status= req.body.status;
    const query= {_id: new ObjectId(id)};
    const updatedDoc={
      $set:{status:status, workStatus:'available'}
    };

    const result= await riderCollection.updateOne(query,updatedDoc);
    // if(status === 'approved'){        PH
    if(result.modifiedCount > 0 && status === 'approved'){   //My Change
      const email= req.body.email;
      const userQuery= {email};
      const updateUser= {
        $set:{role:'rider'}
      }
      const userResult= await userCollection.updateOne(userQuery,updateUser)
    }
    
    res.send(result)
   })

   //! AI Version
   /* 
   app.patch('/riders/:identification', async (req, res) => {

  try {
    const id = req.params.identification;
    const status = req.body.status;
    const query = { _id: new ObjectId(id) };

    const updatedDoc = {
      $set: { status: status }
    };

    const result = await riderCollection.updateOne(query, updatedDoc);

    // First ensure rider update success
    if (result.modifiedCount > 0 && status === 'approved') {

      const rider = await riderCollection.findOne(query);

      const userQuery = { email: rider.email };

      const updateUser = {
        $set: { role: 'rider' }
      };

      await userCollection.updateOne(userQuery, updateUser);
    }

    res.send(result);

  } catch (error) {

    res.status(500).send({
      message: 'Something went wrong',
      error: error.message
    });

  }

});
   */




 /* app.patch('/riders/:id', async(req,res)=>{
      const id= req.params.id;
      const status= req.body.status;
      const query= {_id: new ObjectId(id)};
      const updatedDoc={
        $set:{
          status:status
        }
      }
      const result= await riderCollection.updateOne(query,updatedDoc);
      res.send(result);
    }) */



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB✔",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    //! await client.close();
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("Hello from percel delivery server!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
