const express = require('express');
const cors = require('cors');

require('dotenv').config()
const jwt = require('jsonwebtoken')

const app = express()
const port = process.env.PORT || 5000;

app.use(cors())
app.use(express.json());


const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.y1q9j.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const verifyToken = (req, res, next) => {
    const auth = req.headers.authorization
    if (!auth) {
        res.status(401).send({ message: 'unauthorize access' })
    }
    const token = auth.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_SECRET, (error, decoded) => {
        if (error) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next()
    })
}

const run = async () => {
    try {
        await client.connect();
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('booking');
        const userCollection = client.db('doctors_portal').collection('user');
        const doctorCollection = client.db('doctors_portal').collection('doctors');
        const paymentCollection = client.db('doctors_portal').collection('payments');

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;

            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.roll === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'Forbidden' });
            }
        }



        app.put('/user/admin/:email', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;

            const filter = { email: email }
            const updateDoc = {
                $set: {
                    roll: 'admin',
                },
            };

            const result = await userCollection.updateOne(filter, updateDoc)
            res.send({ result, })
        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;

            const user = await userCollection.findOne({ email: email })

            const isAdmin = user.roll === 'admin';
            res.send({ admin: isAdmin });

        })

        app.get('/service', async (req, res) => {
            const query = {}
            const cursor = servicesCollection.find(query).project({ name: 1, });
            const result = await cursor.toArray()
            res.send(result)
        })



        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;

            const filter = { email: email }
            const user = req.body;
            const options = { upsert: true }
            const updateDoc = {
                $set: user,
            };

            const result = await userCollection.updateOne(filter, updateDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_SECRET, { expiresIn: '1h' })

            res.send({ result, token })
        })

        app.get('/user', verifyToken, async (req, res) => {
            const users = await userCollection.find({}).toArray();
            res.send(users)
        });

        /**
         * API Naming convention
         * app.get('/booking') // get all booking in this collection or get more then one or by filter
         * app.get('/booking/:id') //get specific by id
         * app.post('/booking')  //add a new booking'
         * app.patch('/booking/:id) // update a item by id
         * app.put('/booking/:id) // upsert ==> update (if exists ) or insert(if doesn't exist)
         * app.delete('/booking/:id')  /delete a item
         * 
         */

        app.get('/booking', verifyToken, async (req, res) => {
            const email = req.decoded.email
            const patient = req.query.patient;
            if (patient === email) {
                const query = { patient: patient }
                const booking = await bookingCollection.find(query).toArray()
                return res.send(booking)
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' })
            }
        })

        app.get('/booking/:id', verifyToken, async (req, res) => {
            const { id } = req.params;
            const query = { _id: ObjectId(id) };
            const booking = await bookingCollection.findOne(query);
            res.send(booking)
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body

            const query = { treatment: booking.treatment, data: booking.data, patient: booking.patient }
            const exist = await bookingCollection.findOne(query)
            if (exist) {
                return res.send({ success: false, booking: exist })
            }
            const result = await bookingCollection.insertOne(booking);
            res.send({ success: true, booking: result })
        })

        app.put('/booking/:id',verifyToken, async(req, res)=>{
            const {id} = req.params;
           
            
            const filter = {_id: ObjectId(id)}
            console.log(req.body.transactionId)
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: req.body.transactionId,
                }
            }
            const update = await bookingCollection.updateOne(filter, updateDoc);
            const result = await paymentCollection.insertOne(req.body);

            res.send(update);
            
        })



        //warning

        // this is not the proper way to query 
        // after learning more about mongodb .. use aggregate lookup , pipeline, match ,group;
        app.get('/available', async (req, res) => {
            const date = req.query

            // step 1 : get all services
            const services = await servicesCollection.find({}).toArray()

            // step 2: get the booking of that day; output: [{}, {}, {}, {}]


            const bookings = await bookingCollection.find(date).toArray()


            // step 03 : for each service , find bookings for that service
            services.forEach(service => {
                // step 4: find bookings for that service ...output [{}, {}]
                const serviceBooking = bookings.filter(b => b.treatment === service.name);
                // step 5: select slots for the service bookings : ['', '', '', '', '']
                const booked = serviceBooking.map(s => s.slot);

                // step 6: select those slots that are not in booked slots 

                // service.booked = booked;
                // console.log(service)
                // service.booked = serviceBooking.map(s=>s.slot);

                const available = service.slots.filter(s => !booked.includes(s))
                service.slots = available;

            })
            res.send(services)
        })

        app.get('/doctor', verifyToken, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find({}).toArray()
            res.send(doctors)
        })

        app.post('/doctor', verifyToken, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor)
            res.send(result)
        })

        app.delete('/doctor/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const result = await doctorCollection.deleteOne(filter)
            res.send(result)
        })

        app.post('/create-payment-intent', verifyToken, async (req, res) => {
            const { price } = req.body;

            const amount = Number(price) * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card'],

            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })
    }
    finally {

    }

}

run().catch(console.dir)



app.get('/', (req, res) => {

    res.send('server connect successfully')
})
app.listen(port, () => {
    console.log('server is runnig port 5000')
})