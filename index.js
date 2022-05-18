const express = require('express');
const cors = require('cors');

require('dotenv').config()
const jwt = require('jsonwebtoken')

const app = express()
const port = process.env.PORT || 5000;

app.use(cors())
app.use(express.json());


const { MongoClient, ServerApiVersion } = require('mongodb');
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

        app.get('/service', async (req, res) => {
            const query = {}
            const cursor = servicesCollection.find(query);
            const result = await cursor.toArray()
            res.send(result)
        })

        app.put('/user/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.roll === 'admin') {
                const filter = { email: email }
                const updateDoc = {
                    $set: {
                        roll: 'admin',
                    },
                };

                const result = await userCollection.updateOne(filter, updateDoc)
                res.send({ result, })
            }
            else{
                res.status(403).send({message: 'Forbidden'});
            }

        })


        app.get('/admin/:email', async (req, res)=>{
            const email = req.params.email;
          
            const user = await userCollection.findOne({email: email})

            const isAdmin = user.roll === 'admin';
            res.send({admin: isAdmin});
           
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
        })
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