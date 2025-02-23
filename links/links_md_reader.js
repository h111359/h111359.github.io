document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.links_list_element a').forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();
            const mdFile = link.getAttribute('data-md-file');
            fetchAndDisplayMarkdown(mdFile);
        });
    });
});

function fetchAndDisplayMarkdown(mdFile) {
    fetch(mdFile)
        .then(response => response.text())
        .then(linksMarkdown => {
            const sections = parseMarkdown(linksMarkdown);
            displayLinks(sections);
        })
        .catch(error => console.error('Error fetching the Markdown file:', error));
}

function parseMarkdown(linksMarkdown) {
    const sections = [];
    let currentSection = null;
    const lines = linksMarkdown.split('\n');
    const linkPattern = /\[([^\]]+)\]\(([^\)]+)\)/;
    const headerPattern = /^(#{1,6})\s+(.*)/;

    lines.forEach(line => {
        line = line.trim();

        const headerMatch = line.match(headerPattern);
        if (headerMatch) {
            if (currentSection) {
                sections.push(currentSection);
            }
            currentSection = {
                title: headerMatch[2].trim() || 'Untitled Section',
                links: []
            };
        } else if (linkPattern.test(line)) {
            const match = line.match(linkPattern);
            if (match && currentSection) {
                let url = match[2].trim();
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'http://' + url;
                }
                currentSection.links.push({
                    description: match[1].trim(),
                    url: url
                });
            }
        }
    });

    if (currentSection) {
        sections.push(currentSection);
    }
    
    return sections;
}

function displayLinks(sections) {
    const linkList = document.getElementById('linkList');
    linkList.innerHTML = '';

    sections.forEach(section => {
        if (section.title && section.links.length > 0) {
            const sectionTitle = document.createElement('h3');
            sectionTitle.textContent = section.title;
            linkList.appendChild(sectionTitle);

            const ul = document.createElement('ul');
            section.links.forEach(link => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                
                a.href = link.url;
                a.textContent = link.description;
                a.target = '_blank';

                li.appendChild(a);
                ul.appendChild(li);
            });
            linkList.appendChild(ul);
        }
    });
}
