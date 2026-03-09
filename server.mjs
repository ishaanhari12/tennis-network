import express from 'express';
import { MongoClient } from 'mongodb';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import expressSession from 'express-session';
import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);



const app = express();
const PREFIX = "/M00997995";

app.use(express.json());
app.use(express.static("public"));
app.use(expressSession({
  secret: "lkjsdlfkjsdflks",
  resave: false,
  saveUninitialized: true
}));

const MONGO_URL = "mongodb://127.0.0.1:27017";
const DB_NAME = "matchpoint";
let db;

MongoClient.connect(MONGO_URL)
  .then(client => {
    db = client.db(DB_NAME);
    console.log("MongoDB connected");
  })
  .catch(err => console.error("MongoDB connection error:", err));

// ======================= USERS =======================
app.post(PREFIX + "/users", async (req,res)=>{
  try {
    const {name,email,password} = req.body;
    if(!name||!email||!password) return res.status(400).json({error:"All fields required"});

    const existing = await db.collection("users").findOne({email});
    if(existing) return res.status(400).json({error:"Email already exists"});

    const user = {name,email,password,following:[],createdAt:new Date()};
    const result = await db.collection("users").insertOne(user);
    res.json({userId: result.insertedId.toString(), name, email});
  } catch(err) { console.error(err); res.status(500).json({error:"Server error"}); }
});

app.get(PREFIX + "/users", async (req,res)=>{
  try {
    const q = req.query.q || "";
    const users = await db.collection("users").find({name:{$regex:q,$options:"i"}}).toArray();
    res.json(users);
  } catch(err){ console.error(err); res.status(500).json({error:"Server error"}); }
});

// ======================= LOGIN =======================
app.post(PREFIX + "/login", async (req,res)=>{
  try {
    const {email,password} = req.body;
    if(!email||!password) return res.status(400).json({error:"All fields required"});

    const user = await db.collection("users").findOne({email});
    if(!user || user.password!==password) return res.status(400).json({error:"Invalid credentials"});

    req.session.email = user.email;
    res.json({userId:user._id.toString(), login:true, email:user.email, name:user.name});
  } catch(err){ console.error(err); res.status(500).json({error:"Server error"}); }
});

app.get(PREFIX + "/login", (req,res)=>{
  if(req.session.email) return res.json({login:true,email:req.session.email});
  res.json({login:false});
});

app.delete(PREFIX + "/login", (req,res)=>{
  req.session.destroy(err=>{
    if(err) return res.json({error:true,message:"Logout error"});
    res.json({login:false});
  });
});

// ======================= CONTENT =======================
app.post(PREFIX + "/contents", async (req,res)=>{
  try {
    if(!req.session.email) return res.status(401).json({error:"Not logged in"});
    const {text, media} = req.body;
    if(!text && !media) return res.status(400).json({error:"Text or media required"});

    const content = {email:req.session.email,text,media:media||null,createdAt:new Date()};
    const result = await db.collection("contents").insertOne(content);
    res.json({ok:true, contentId: result.insertedId.toString()});
  } catch(err){ console.error(err); res.status(500).json({error:"Server error"}); }
});

app.get(PREFIX + "/contents", async (req,res)=>{
  try {
    const q = req.query.q || "";
    const contents = await db.collection("contents").find({text:{$regex:q,$options:"i"}}).toArray();
    res.json(contents);
  } catch(err){ console.error(err); res.status(500).json({error:"Server error"}); }
});

// ======================= FOLLOW =======================
app.post(PREFIX + "/follow", async (req,res)=>{
  try {
    if(!req.session.email) return res.status(401).json({error:"Not logged in"});
    const {emailToFollow} = req.body;
    if(!emailToFollow) return res.status(400).json({error:"Email required"});

    await db.collection("users").updateOne(
      {email:req.session.email},
      {$addToSet:{following:emailToFollow}}
    );
    res.json({ok:true});
  } catch(err){ console.error(err); res.status(500).json({error:"Server error"}); }
});

app.delete(PREFIX + "/follow", async (req,res)=>{
  try {
    if(!req.session.email) return res.status(401).json({error:"Not logged in"});
    const {emailToUnfollow} = req.body;
    if(!emailToUnfollow) return res.status(400).json({error:"Email required"});

    await db.collection("users").updateOne(
      {email:req.session.email},
      {$pull:{following:emailToUnfollow}}
    );
    res.json({ok:true});
  } catch(err){ console.error(err); res.status(500).json({error:"Server error"}); }
});

// ======================= FEED =======================
app.get(PREFIX + "/feed", async (req,res)=>{
  try {
    if(!req.session.email) return res.status(401).json({error:"Not logged in"});
    const user = await db.collection("users").findOne({email:req.session.email});
    const posts = await db.collection("contents").find({email:{$in:user.following}}).sort({createdAt:-1}).toArray();
    res.json(posts);
  } catch(err){ console.error(err); res.status(500).json({error:"Server error"}); }
});

// ======================= LIKE / COMMENT =======================
app.post(PREFIX + "/like", async (req,res)=>{
  try {
    if(!req.session.email) return res.status(401).json({error:"Not logged in"});
    const {postId} = req.body;
    if(!postId) return res.status(400).json({error:"postId required"});

    await db.collection("likes").updateOne(
      {postId,email:req.session.email},
      {$set:{postId,email:req.session.email,createdAt:new Date()}},
      {upsert:true}
    );
    res.json({ok:true});
  } catch(err){ console.error(err); res.status(500).json({error:"Server error"}); }
});

app.post(PREFIX + "/comment", async (req,res)=>{
  try {
    if(!req.session.email) return res.status(401).json({error:"Not logged in"});
    const {postId,comment} = req.body;
    if(!postId || !comment) return res.status(400).json({error:"postId & comment required"});
    await db.collection("comments").insertOne({postId,email:req.session.email,comment,createdAt:new Date()});
    res.json({ok:true});
  } catch(err){ console.error(err); res.status(500).json({error:"Server error"}); }
});

// ======================= MESSAGING =======================
app.post(PREFIX + "/message", async (req,res)=>{
  try {
    if(!req.session.email) return res.status(401).json({error:"Not logged in"});
    const {toEmail,text} = req.body;
    if(!toEmail || !text) return res.status(400).json({error:"toEmail & text required"});
    await db.collection("messages").insertOne({from:req.session.email,to:toEmail,text,createdAt:new Date()});
    res.json({ok:true});
  } catch(err){ console.error(err); res.status(500).json({error:"Server error"}); }
});

app.get(PREFIX + "/messages", async (req,res)=>{
  try {
    if(!req.session.email) return res.status(401).json({error:"Not logged in"});
    const other = req.query.with;
    if(!other) return res.status(400).json({error:"with query required"});
    const msgs = await db.collection("messages").find({$or:[
      {from:req.session.email,to:other},
      {from:other,to:req.session.email}
    ]}).sort({createdAt:1}).toArray();
    res.json(msgs);
  } catch(err){ console.error(err); res.status(500).json({error:"Server error"}); }
});

// ======================= PROFILE =======================
app.post(PREFIX + "/profile/edit", async (req,res)=>{
  try {
    if(!req.session.email) return res.status(401).json({error:"Not logged in"});
    const {name,password} = req.body;
    const update = {};
    if(name) update.name = name;
    if(password) update.password = password;
    if(Object.keys(update).length===0) return res.status(400).json({error:"Nothing to update"});
    await db.collection("users").updateOne({email:req.session.email},{$set:update});
    res.json({ok:true});
  } catch(err){ console.error(err); res.status(500).json({error:"Server error"}); }
});

// ======================= FILE UPLOAD =======================
const uploadsDir = path.join(process.cwd(),'uploads');
if(!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {   // <-- add cb here
    const unique = Date.now() + "-" + Math.round(Math.random()*1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({storage});

app.post(PREFIX + "/upload", upload.single('file'), (req, res) => {
  try {
    if (!req.session.email) return res.status(401).json({ error: "Not logged in" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Ensure path starts with student ID
    const url = `/uploads/${req.file.filename}`;
    res.json({ ok: true, url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get(PREFIX + "/my-posts", async (req, res) => {
  try {
    if (!req.session.email) return res.status(401).json({ error: "Not logged in" });

    const posts = await db.collection("contents")
      .find({ email: req.session.email })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ======================= WEATHER =======================
app.get(PREFIX + "/weather", async (req,res)=>{
  try {
    const lat = 51.509865;   // London latitude
    const lon = -0.118092;   // London longitude

    // Request chance of rain (precipitation probability)
    const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=precipitation_probability`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    const currentHour = new Date().getHours();
    const rainChance = data.hourly.precipitation_probability[currentHour];

    res.json({
      temp: data.current_weather.temperature,
      desc: "Current conditions",
      wind: data.current_weather.windspeed,
      rainChance: rainChance
    });
 
  } catch (err) {
    console.error("Weather API error:", err);
    res.status(500).json({error:"Failed to load weather"});
  }
});


//--------------------TENNIS GPT---------------------------//
app.post(PREFIX + "/tennis-gpt", async (req, res) => {
  try {
    if (!req.session.email) 
      return res.status(401).json({ error: "Not logged in" });

    const { question } = req.body;
    if (!question) 
      return res.status(400).json({ error: "Question required" });

    // ----------- GEMINI FREE API CALL -----------
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(
      `You are a helpful tennis assistant. Answer clearly.\nUser question: ${question}`
    );

    const answer = result.response.text();
    // --------------------------------------------

    res.json({ answer });

  } catch (err) {
    console.error("Gemini Error:", err);
    res.status(500).json({ error: "Failed to get TennisGPT answer" });
  }
});



// ======================= START SERVER =======================
const PORT = 3000;
app.listen(PORT, ()=>console.log(`Server running at http://localhost:${PORT}`));
