document.addEventListener('DOMContentLoaded', () => {
    const fileUrl = 'https://hmhristov.com/links/links.md?v=' + new Date().getTime();

    fetch(fileUrl)
        .then(response => response.text())
        .then(linksMarkdown => {
            const sections = [];
            let currentSection = null;
            const lines = linksMarkdown.split('\n');

            // Regex pattern to capture anything between brackets as description and anything between parentheses as URL
            const linkPattern = /\[([^\]]+)\]\(([^\)]+)\)/;

            lines.forEach(line => {
                line = line.trim(); // Trim any extra whitespace

                // Handle section titles
                if (line.startsWith('### ')) {
                    if (currentSection) {
                        sections.push(currentSection);
                    }
                    currentSection = {
                        title: line.substring(4).trim() || 'Untitled Section',
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

            displayLinks(sections);
        })
        .catch(error => console.error('Error fetching the Markdown file:', error));
});

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