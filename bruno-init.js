const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'bruno_collection');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

fs.writeFileSync(path.join(dir, 'bruno.json'), JSON.stringify({
    "version": "1",
    "name": "Movie Reviews API",
    "type": "collection",
    "ignore": ["node_modules", ".git"]
}, null, 2));

const createBru = (filename, name, method, url, body = '') => {
    const content = `meta {
  name: ${name}
  type: http
  seq: 1
}

${method} {
  url: ${url}
  body: ${body ? 'json' : 'none'}
  auth: inherit
}

${body ? `body:json {\n${body}\n}` : ''}`;
    fs.writeFileSync(path.join(dir, filename), content);
};

createBru('Login Admin.bru', 'Login Admin', 'post', 'http://localhost:3000/api/auth/login', '  "username": "admin",\n  "password": "qwerty123"');
createBru('Get All Movies.bru', 'Get All Movies', 'get', 'http://localhost:3000/api/movies?page=1&limit=5');
createBru('Get Movie by ID.bru', 'Get Movie by ID', 'get', 'http://localhost:3000/api/movies/1');
createBru('Pending Reviews.bru', 'Pending Reviews', 'get', 'http://localhost:3000/api/admin/reviews/pending');

console.log('Коллекция Bruno успешно создана в папке "bruno_collection"!');