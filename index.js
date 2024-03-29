const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config()
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
// middleware
app.use(cors());
app.use(express.json())



const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' })
  }
  // bearer token 
  const token = authorization.split(' ')[1]
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0mmsquj.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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

    const usersCollection = client.db("summerDb").collection("users")
    const reviewsCollection = client.db("summerDb").collection("reviews")
    const classesCollection = client.db("summerDb").collection("classes")
    const cartCollection = client.db("summerDb").collection("carts")
    const paymentCollection = client.db("summerDb").collection("payment")

    //jwt--------------------

    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '2h' })
      res.send({ token })
    })
    //verifyAdmin ; warning: use verifyAdmin before using verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden message' })
      }
      next();
    }

    //user ----------------------------------------
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result)
    })

    app.get('/instructor', async (req, res) => {
      const filter = { role: 'instructor' };
      const approvedClasses = await usersCollection.find(filter).toArray();
      res.send(approvedClasses);
    });

    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);
    })

    app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === 'instructor' }
      res.send(result);
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists' })
      }
      const result = await usersCollection.insertOne(user);
      res.send(result)
    })

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result)
    })
    app.patch('/users/instructor/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'instructor'
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result)
    })

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await usersCollection.deleteOne(query)
      res.send(result)
    })

    //reviews ------------------------------------------
    app.get('/reviews', async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    })

    //classes---------------------------------------------------
    app.get('/classes', async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    })

    app.get('/classes/approved', async (req, res) => {
      const filter = { status: 'approved' };
      const approvedClasses = await classesCollection.find(filter).toArray();
      res.send(approvedClasses);
    });


    app.get('/classes/instructor/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      try {
        const query = { instructorEmail: email }; // Filter classes by instructor's email
        const result = await classesCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: true, message: 'Internal server error' });
      }
    });


    app.post('/classes', async (req, res) => {
      const newItem = req.body;
      const result = await classesCollection.insertOne(newItem)
      res.send(result);
    })

    app.patch('/classes/approved/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: 'approved'
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result)
    })

    app.patch('/classes/denied/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: 'denied'
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result)
    })

    app.patch('/classes/feedback/:id', async (req, res) => {
      const { feedback } = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: feedback
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc)
      res.send(result)
    });

    //cart collection------------------------------------
    app.get('/carts', verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'forbidden access' })
      }
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/carts', async (req, res) => {
      const item = req.body;
      const result = await cartCollection.insertOne(item);
      res.send(result);
    });

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await cartCollection.deleteOne(query)
      res.send(result)
    })
    //payment--------------------------------------------------------------
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })



    app.post('/payments', verifyJWT, async (req, res) => {
      try {
        const payment = req.body;

        // Step 1: Insert payment information
        const insertResult = await paymentCollection.insertOne(payment);

        // Step 2: Delete items from the cart
        const cartQuery = { _id: { $in: payment.cartId.map(id => new ObjectId(id)) } };
        const deleteResult = await cartCollection.deleteMany(cartQuery);

        // Step 3: Update class availability
        const classQuery = { _id: { $in: payment.classIds.map(id => new ObjectId(id)) } };
        const classesToUpdate = await classesCollection.find(classQuery).toArray();

        const uniqueClassIds = {};
        for (const id of payment.classIds) {
          if (uniqueClassIds[id]) {
            uniqueClassIds[id]++;
          } else {
            uniqueClassIds[id] = 1;
          }
        }

        for (const id in uniqueClassIds) {
          const cls = classesToUpdate.find(c => c._id.toString() === id);
          if (cls) {
            const quantity = uniqueClassIds[id];
            const updatedAvailableSeats = cls.availableSeats - quantity;
            const updatedEnrolled = cls.enrolled ? cls.enrolled + quantity : quantity;

            await classesCollection.updateOne(
              { _id: cls._id },
              { $set: { availableSeats: updatedAvailableSeats, enrolled: updatedEnrolled } }
            );
          }
        }

        res.send({ insertResult, deleteResult });
      } catch (error) {
        // Handle errors
        res.status(500).send(error.message);
      }
    });

    app.get('/payment/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      try {
        const query = { email: email }; // Filter payments by email
        const result = await paymentCollection.find(query).sort({ date: -1 }).toArray();
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: true, message: 'Internal server error' });
      }
    });
    

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send("summer camp starting...")
})

app.listen(port, () => {
  console.log(`summer camp starting in port ${port}`)
})