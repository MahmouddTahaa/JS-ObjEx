// unreadable
db.users.insertOne({ _id: 101, name: "Ali", contact: { email: "ali@example.com", phone: "0123456789" }, address: { city: "Alexandria", zip: 21500 }, roles: ["admin", "editor"],active: true });

// really?
db.users.insertOne({
  _id: 101,
  name: 
    "Ali",
  contact: {
    email: 
      "ali@example.com",
    phone: 
      "0123456789",
  },
  address: {
    city: 
      "Alexandria",
    zip: 
      21500,
    city: 
      "Alexandria",
    zip: 
      21500,
    city: 
      "Alexandria",
    zip: 
      21500,
  },
  roles: 
    [
      "admin",
      "editor"
    ],
  active: 
    true,
});

// chef's kiss
db.users.insertOne({
  _id: 101,
  name: "Ali",
  contact: { email: "ali@example.com", phone: "0123456789" },
  address: { city: "Alexandria", zip: 21500 },
  roles: ["admin", "editor"],
  active: true,
});
