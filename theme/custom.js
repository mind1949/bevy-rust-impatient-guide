(function() {
    'use strict';
    function buildPageToc() {
        var main = document.querySelector('#content main');
        if (!main) return;
        var headings = main.querySelectorAll('h2, h3');
        if (headings.length < 2) return;

        var html = '';
        for (var i = 0; i < headings.length; i++) {
            var h = headings[i];
            if (!h.id) continue;
            var tag = h.tagName.toLowerCase();
            html += '<a class="toc-' + tag + '" href="#' + h.id + '">' + h.textContent + '</a>';
        }
        if (!html) return;

        var panel = document.createElement('div');
        panel.id = 'page-toc-panel';
        panel.innerHTML = html;

        var btn = document.createElement('button');
        btn.id = 'page-toc-toggle';
        btn.innerHTML = '<span class="icon-list">☰</span><span class="icon-close">✕</span>';
        btn.setAttribute('title', '页面目录');
        btn.setAttribute('aria-label', 'Toggle page table of contents');

        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            btn.classList.toggle('open');
            panel.classList.toggle('open');
        });

        document.body.appendChild(btn);
        document.body.appendChild(panel);

        // Highlight current section on scroll
        var tocLinks = panel.querySelectorAll('a');
        function updateActive() {
            var scrollY = window.scrollY + 120;
            var activeId = '';
            for (var i = 0; i < headings.length; i++) {
                var h = headings[i];
                if (h.offsetTop <= scrollY) {
                    activeId = h.id;
                }
            }
            for (var j = 0; j < tocLinks.length; j++) {
                var link = tocLinks[j];
                if (link.getAttribute('href') === '#' + activeId) {
                    link.classList.add('toc-active');
                } else {
                    link.classList.remove('toc-active');
                }
            }
        }
        window.addEventListener('scroll', updateActive);
        updateActive();

        // Close on click outside
        document.addEventListener('click', function(e) {
            if (!btn.contains(e.target) && !panel.contains(e.target)) {
                btn.classList.remove('open');
                panel.classList.remove('open');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildPageToc);
    } else {
        buildPageToc();
    }
})();
