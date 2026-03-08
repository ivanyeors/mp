import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const turndownService = new TurndownService({ headingStyle: 'atx' });

const BASE_URL = 'https://www.mpillow.com';
const START_URL = 'https://www.mpillow.com/blogs/mpillow-blogs';
const TOTAL_PAGES = 10;
const OUTPUT_DIR = path.join(process.cwd(), 'data/blogs');
const IMAGE_DIR = path.join(process.cwd(), 'public/images/blogs');

async function downloadImage(url, filepath) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(filepath, buffer);
        return true;
    } catch (error) {
        console.error(`Error downloading image ${url}:`, error.message);
        return false;
    }
}

async function extractBlogData(url) {
    console.log(`Extracting: ${url}`);
    try {
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        // Extract JSON-LD for rich metadata and content
        let jsonLdData = null;
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const json = JSON.parse($(el).html());
                if (json['@type'] === 'Article') {
                    jsonLdData = json;
                }
            } catch (e) {
                // Ignore JSON parse errors
            }
        });

        if (!jsonLdData) {
            console.warn(`WARNING: Could not find JSON-LD Article data for ${url}`);
            return null;
        }

        const title = jsonLdData.headline;
        const description = jsonLdData.description || '';
        const datePublished = jsonLdData.datePublished || '';
        const dateModified = jsonLdData.dateModified || '';
        const author = jsonLdData.author?.name || 'Mpillow';
        const mainImageUrl = jsonLdData.image || '';
        const articleBody = jsonLdData.articleBody || '';

        // Slugging
        const slug = url.split('/').pop().split('?')[0];

        // Download image if exists
        let localImageUrl = '';
        if (mainImageUrl) {
            // Handle protocol-relative URLs (//cdn...)
            const fullImgUrl = mainImageUrl.startsWith('//') ? `https:${mainImageUrl}` : mainImageUrl;

            // Clean up fastly/cdn params for cleaner filenames
            const imgFilename = slug + '.jpg';
            const filepath = path.join(IMAGE_DIR, imgFilename);

            await downloadImage(fullImgUrl, filepath);
            localImageUrl = `/images/blogs/${imgFilename}`;
        }

        // Convert raw text/html to markdown
        let markdownContent = '';
        if (articleBody) {
            markdownContent = articleBody.replace(/\n\n/g, '\n\n'); // Ensure proper spacing
        } else {
            // Fallback to cheerio parsing if articleBody is empty in JSON-LD
            let contentArea = $('.article-template__content');
            if (!contentArea.length) contentArea = $('.blog-content');
            if (!contentArea.length) contentArea = $('.post-content');
            if (!contentArea.length) contentArea = $('.main-content');

            if (contentArea.length) {
                markdownContent = turndownService.turndown(contentArea.html());
            }
        }


        const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
description: "${description.replace(/"/g, '\\"')}"
datePublished: "${datePublished}"
dateModified: "${dateModified}"
author: "${author}"
image: "${localImageUrl}"
slug: "${slug}"
---

`;

        const fullMarkdown = frontmatter + markdownContent;
        const outputPath = path.join(OUTPUT_DIR, `${slug}.mdx`);
        fs.writeFileSync(outputPath, fullMarkdown);
        console.log(`Saved: ${outputPath}`);
        return true;
    } catch (error) {
        console.error(`Error processing blog ${url}:`, error.message);
        return false;
    }
}

async function scrapePage(pageUrl) {
    console.log(`Fetching Hub Page: ${pageUrl}`);
    const res = await fetch(pageUrl);
    const html = await res.text();
    const $ = cheerio.load(html);

    const links = [];
    $('a').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('/blogs/mpillow-blogs/') && !href.includes('/tagged/')) {
            // Only add unique articles
            const fullUrl = href.startsWith('http') ? href : BASE_URL + href;
            if (!links.includes(fullUrl)) {
                links.push(fullUrl);
            }
        }
    });

    console.log(`Found ${links.length} blog articles on ${pageUrl}`);

    for (const link of links) {
        await extractBlogData(link);
        // Be polite, add small delay
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

async function main() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    if (!fs.existsSync(IMAGE_DIR)) {
        fs.mkdirSync(IMAGE_DIR, { recursive: true });
    }

    for (let i = 1; i <= TOTAL_PAGES; i++) {
        const pageUrl = i === 1 ? START_URL : `${START_URL}?page=${i}`;
        await scrapePage(pageUrl);
    }
    console.log('Finished scraping all pages.');
}

main();
