import fs from 'fs';

async function check() {
    const url = 'https://www.mpillow.com/blogs/mpillow-blogs/how-to-choose-the-best-pillow-in-singapore';
    const res = await fetch(url);
    const html = await res.text();
    fs.writeFileSync('temp-blog.html', html);
    console.log('Saved temp-blog.html');
}

check();
