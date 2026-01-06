/// <reference path="./_external/.manga-provider.d.ts" />
/// <reference path="./_external/core.d.ts" />

// ===================================================================
// Extension Scan-VF pour Seanime - MANGA PROVIDER
// ===================================================================
// Site : https://www.scan-vf.net
// Auteur : Xiu991
// Type : Manga (scan/lecture d'images)
// ===================================================================

const DevMode = true;
const originalConsoleLog = console.log;
console.log = function (...args: any[]) {
    if (DevMode) {
        originalConsoleLog.apply(console, args);
    }
};

class Provider {

    readonly SITE_URL = "https://www.scan-vf.net";
    readonly SEARCH_URL = "https://www.scan-vf.net";

    getSettings(): MangaProviderSettings {
        return {
            canSearch: true,
            supportsMangaSearch: true,
        };
    }

    async search(opts: MangaSearchOptions): Promise<MangaSearchResult[]> {
        console.log(`🔍 Recherche manga: "${opts.query}"`);
        
        try {
            const normalizedQuery = this.normalizeQuery(opts.query);
            console.log(`📝 Requête normalisée: "${normalizedQuery}"`);
            
            // Scan-VF: recherche via paramètre ?s=
            const searchUrl = `${this.SEARCH_URL}/?s=${encodeURIComponent(normalizedQuery)}`;
            console.log(`🔗 URL recherche: ${searchUrl}`);
            
            const html = await this.GETText(searchUrl);
            console.log(`✅ HTML reçu: ${html.length} caractères`);
            
            const $ = await LoadDoc(html);
            const results: MangaSearchResult[] = [];
            
            // DEBUG: Afficher TOUS les sélecteurs possibles
            console.log(`🔍 DEBUG - Test de tous les sélecteurs:`);
            console.log(`   article: ${$("article").length()}`);
            console.log(`   div.item: ${$("div.item").length()}`);
            console.log(`   div.manga: ${$("div[class*='manga']").length()}`);
            console.log(`   div.post: ${$("div.post, div[class*='post']").length()}`);
            console.log(`   a[href*='/manga/']: ${$("a[href*='/manga/']").length()}`);
            console.log(`   a[href*='/scan/']: ${$("a[href*='/scan/']").length()}`);
            console.log(`   Tous les liens: ${$("a").length()}`);
            
            // Essayer TOUS les sélecteurs possibles
            const mangaItems = $("article, div.item, div.manga-item, div.bs, div.post, div[class*='manga'], div[class*='post']");
            console.log(`📚 Éléments trouvés: ${mangaItems.length()}`);
            
            if (mangaItems.length() === 0) {
                console.warn(`⚠️ Aucun élément avec sélecteurs, essai TOUS LES LIENS...`);
                
                // PRENDRE ABSOLUMENT TOUS LES LIENS
                const allLinks = $("a");
                console.log(`🔗 Total liens: ${allLinks.length()}`);
                
                const seenUrls = new Set<string>();
                let foundCount = 0;
                
                for (let i = 0; i < allLinks.length() && foundCount < 20; i++) {
                    const link = allLinks.eq(i);
                    const url = link.attr("href");
                    
                    if (!url || seenUrls.has(url)) continue;
                    
                    // Filtrer seulement URLs qui ressemblent à des mangas
                    if (!url.includes('/manga') && !url.includes('/scan') && !url.includes('/read')) {
                        continue;
                    }
                    
                    seenUrls.add(url);
                    
                    const title = link.attr("title") || link.text().trim();
                    if (!title || title.length < 2) continue;
                    
                    console.log(`🔍 [${foundCount}] "${title}" -> ${url.substring(0, 50)}...`);
                    
                    const fullUrl = url.startsWith('http') ? url : this.SITE_URL + url;
                    results.push({
                        id: fullUrl,
                        title: title,
                        url: fullUrl,
                    });
                    foundCount++;
                    console.log(`✨ Ajouté (total: ${foundCount})`);
                }
            } else {
                // Parse normal
                for (let i = 0; i < mangaItems.length(); i++) {
                    const item = mangaItems.eq(i);
                    
                    const title = item.find("h2, h3, .title, .manga-title").text().trim() ||
                                 item.find("a").attr("title") ||
                                 item.find("a").text().trim();
                    
                    const url = item.find("a").attr("href");
                    const image = item.find("img").attr("src") || item.find("img").attr("data-src");
                    
                    if (!title || !url) continue;
                    
                    const matchScore = this.calculateMatchScore(title, normalizedQuery);
                    console.log(`🔍 "${title}" score: ${matchScore.toFixed(2)}`);
                    
                    if (matchScore > 0.05 || normalizedQuery.length < 4) {
                        const fullUrl = url.startsWith('http') ? url : this.SITE_URL + url;
                        
                        results.push({
                            id: fullUrl,
                            title: title,
                            url: fullUrl,
                            image: image ? (image.startsWith('http') ? image : this.SITE_URL + image) : undefined
                        });
                        
                        console.log(`✨ Accepté!`);
                    }
                }
            }
            
            // Trier par pertinence
            results.sort((a, b) => {
                const scoreA = this.calculateMatchScore(a.title, normalizedQuery);
                const scoreB = this.calculateMatchScore(b.title, normalizedQuery);
                return scoreB - scoreA;
            });
            
            console.log(`🎉 Total: ${results.length} résultat(s)`);
            return results.slice(0, 20);
            
        } catch (error) {
            console.error(`❌ Erreur recherche:`, error);
            return [];
        }
    }

    async findChapters(id: string): Promise<MangaChapter[]> {
        console.log(`📖 Récupération chapitres: ${id}`);
        
        try {
            const html = await this.GETText(id);
            console.log(`✅ Page chargée: ${html.length} caractères`);
            
            const $ = await LoadDoc(html);
            const chapters: MangaChapter[] = [];
            
            // Méthode 1: Liste de chapitres standard
            const chapterLinks = $("ul.chapters li, div.chapter-list a, div.eplister a, li.wp-manga-chapter a");
            console.log(`📋 Chapitres méthode 1: ${chapterLinks.length()}`);
            
            for (let i = 0; i < chapterLinks.length(); i++) {
                const link = chapterLinks.eq(i);
                const href = link.attr("href");
                const text = link.text().trim();
                
                if (!href) continue;
                
                // Extraire numéro de chapitre
                const chMatch = text.match(/(?:chapitre|chapter|ch\.?)\s*(\d+(?:\.\d+)?)/i) ||
                               href.match(/chapter[-_](\d+(?:\.\d+)?)/i);
                
                const number = chMatch ? parseFloat(chMatch[1]) : chapters.length + 1;
                const fullUrl = href.startsWith('http') ? href : this.SITE_URL + href;
                
                chapters.push({
                    id: fullUrl,
                    number: number,
                    title: text || `Chapitre ${number}`,
                    url: fullUrl,
                });
            }
            
            // Méthode 2: Scripts JavaScript
            if (chapters.length === 0) {
                console.log(`⚠️ Méthode 2: Scripts`);
                const scripts = $("script");
                
                for (let i = 0; i < scripts.length(); i++) {
                    const content = scripts.eq(i).html();
                    if (!content || !content.includes("chapter")) continue;
                    
                    const jsonMatch = content.match(/chapters\s*[:=]\s*(\[[\s\S]*?\])/);
                    if (jsonMatch) {
                        try {
                            const chs = JSON.parse(jsonMatch[1]);
                            chs.forEach((ch: any) => {
                                chapters.push({
                                    id: ch.url || `${id}/chapter-${ch.number}`,
                                    number: parseFloat(ch.number || ch.chapter),
                                    title: ch.title || `Chapitre ${ch.number}`,
                                    url: ch.url || `${id}/chapter-${ch.number}`,
                                });
                            });
                        } catch (e) {
                            console.error(`❌ Parse JSON:`, e);
                        }
                    }
                }
            }
            
            // Dédupliquer et trier
            const unique = Array.from(new Map(
                chapters.map(ch => [ch.number, ch])
            ).values());
            
            unique.sort((a, b) => a.number - b.number);
            
            console.log(`✅ Total: ${unique.length} chapitre(s)`);
            return unique;
            
        } catch (error) {
            console.error(`❌ Erreur chapitres:`, error);
            return [];
        }
    }

    async findChapterPages(chapterId: string): Promise<MangaPage[]> {
        console.log(`📄 Récupération pages: ${chapterId}`);
        
        try {
            const html = await this.GETText(chapterId);
            console.log(`✅ Chapitre chargé: ${html.length} caractères`);
            
            const $ = await LoadDoc(html);
            const pages: MangaPage[] = [];
            
            // Méthode 1: Images directes dans le HTML
            const images = $("div#readerarea img, div.reader-area img, div.chapter-content img, img.wp-manga-chapter-img");
            console.log(`🖼️ Images méthode 1: ${images.length()}`);
            
            for (let i = 0; i < images.length(); i++) {
                const img = images.eq(i);
                const src = img.attr("src") || img.attr("data-src") || img.attr("data-lazy-src");
                
                if (!src || src.includes("loading") || src.includes("placeholder")) continue;
                
                const fullUrl = src.startsWith('http') ? src : this.SITE_URL + src;
                
                pages.push({
                    url: fullUrl,
                    page: i + 1,
                    headers: {
                        "Referer": chapterId,
                        "User-Agent": "Mozilla/5.0"
                    }
                });
            }
            
            // Méthode 2: Array JavaScript
            if (pages.length === 0) {
                console.log(`⚠️ Méthode 2: Scripts`);
                const scripts = $("script");
                
                for (let i = 0; i < scripts.length(); i++) {
                    const content = scripts.eq(i).html();
                    if (!content) continue;
                    
                    // Chercher array d'images
                    const arrayMatch = content.match(/(?:pages|images|ts_reader\.run)\s*\(\s*(\[[\s\S]*?\])\s*\)/);
                    if (arrayMatch) {
                        try {
                            const urls = JSON.parse(arrayMatch[1]);
                            urls.forEach((url: string, idx: number) => {
                                if (typeof url === 'string' && url.includes('http')) {
                                    pages.push({
                                        url: url,
                                        page: idx + 1,
                                        headers: {
                                            "Referer": chapterId,
                                            "User-Agent": "Mozilla/5.0"
                                        }
                                    });
                                }
                            });
                        } catch (e) {
                            console.error(`❌ Parse array:`, e);
                        }
                    }
                    
                    if (pages.length > 0) break;
                }
            }
            
            // Méthode 3: Regex simple pour URLs
            if (pages.length === 0) {
                console.log(`⚠️ Méthode 3: Regex`);
                const urlMatches = html.matchAll(/https?:\/\/[^\s'"<>]+\.(?:jpg|jpeg|png|webp|gif)/gi);
                let idx = 1;
                for (const match of urlMatches) {
                    const url = match[0];
                    if (!url.includes('loading') && !url.includes('placeholder')) {
                        pages.push({
                            url: url,
                            page: idx++,
                            headers: {
                                "Referer": chapterId,
                                "User-Agent": "Mozilla/5.0"
                            }
                        });
                    }
                }
            }
            
            console.log(`✅ Total: ${pages.length} page(s)`);
            return pages;
            
        } catch (error) {
            console.error(`❌ Erreur pages:`, error);
            return [];
        }
    }

    // === Méthodes utilitaires ===

    private normalizeQuery(query: string): string {
        return query
            .replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1")
            .replace(/\s+/g, " ")
            .trim();
    }

    private calculateMatchScore(title: string, query: string): number {
        const normTitle = this.normalize(title);
        const normQuery = this.normalize(query);
        
        // Exact match
        if (normTitle === normQuery) return 1.0;
        
        // Contains
        if (normTitle.includes(normQuery)) return 0.9;
        if (normQuery.includes(normTitle)) return 0.8;
        
        // Word match
        const titleWords = normTitle.split(' ').filter(w => w.length > 0);
        const queryWords = normQuery.split(' ').filter(w => w.length > 0);
        let matches = 0;
        
        for (const qWord of queryWords) {
            for (const tWord of titleWords) {
                if (tWord.includes(qWord) || qWord.includes(tWord)) {
                    matches++;
                    break;
                }
            }
        }
        
        return matches / queryWords.length;
    }

    private normalize(str: string): string {
        return str.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    }

    private async GETText(url: string): Promise<string> {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "fr-FR,fr;q=0.9",
                "Referer": this.SITE_URL,
            },
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.text();
    }
}
