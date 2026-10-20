/* Resume page: reveal sections and skill badges as they scroll into view.
   Moved out of resume/index.html so the Content-Security-Policy can use script-src 'self'. */

// Scroll Animations with IntersectionObserver
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observerCallback = (entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');

            // Animate skill bars
            if (entry.target.classList.contains('proficiency-section')) {
                const bars = entry.target.querySelectorAll('.proficiency-fill');
                bars.forEach(bar => {
                    const target = parseInt(bar.getAttribute('data-target'));
                    bar.style.width = target + '%';
                });
            }

            observer.unobserve(entry.target);
        }
    });
};

const observer = new IntersectionObserver(observerCallback, observerOptions);

// Observe all sections
document.querySelectorAll('.section').forEach(section => {
    observer.observe(section);
});

// Observe all experience items
document.querySelectorAll('.experience-item').forEach(item => {
    observer.observe(item);
});

// Stagger badge animations
document.querySelectorAll('.skill-badge').forEach((badge, index) => {
    badge.style.animation = `none`;
    badge.style.opacity = '0';
    badge.style.transform = 'translateY(10px)';
});

// Add stagger delay to badges when parent section becomes visible
const badgeObserverCallback = (entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const badges = entry.target.querySelectorAll('.skill-badge');
            badges.forEach((badge, index) => {
                setTimeout(() => {
                    badge.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
                    badge.style.opacity = '1';
                    badge.style.transform = 'translateY(0)';
                }, index * 50);
            });
        }
    });
};

const badgeObserver = new IntersectionObserver(badgeObserverCallback, observerOptions);
document.querySelectorAll('.skill-card').forEach(card => {
    badgeObserver.observe(card);
});
