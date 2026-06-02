---
name: lmtm-seo-playbook
displayName: SEO Playbook
description: Checklist de auditoría SEO, on-page, off-page, técnico.
required: false
---

# SEO Playbook

## Auditoría inicial (primer mes de cliente)

### Técnico

- [ ] Robots.txt: ¿bloquea páginas importantes? ¿bloquea JS/CSS?
- [ ] Sitemap.xml: ¿existe? ¿se actualiza? ¿está en Search Console?
- [ ] HTTPS: ¿todo el sitio sirve HTTPS? ¿hay mixed content?
- [ ] Core Web Vitals (PageSpeed Insights):
  - LCP < 2.5s
  - INP < 200ms
  - CLS < 0.1
- [ ] Mobile-friendly: ¿pasa el test de Google?
- [ ] Schema.org: ¿hay structured data (Organization, Product, Article, FAQ)?
- [ ] Canonical tags: ¿cada página tiene un canonical único?
- [ ] 404s: ¿hay errores rotos? revisar Search Console > Cobertura.
- [ ] Redirects: ¿hay chains o loops? ¿301 vs 302 correcto?
- [ ] Hreflang: si es multi-idioma, ¿está bien configurado?

### On-page

- [ ] Title tags: únicos, 50-60 chars, keyword al principio.
- [ ] Meta descriptions: únicas, 150-160 chars, con CTA.
- [ ] H1: uno por página, contiene keyword principal.
- [ ] Estructura H2-H6: jerárquica, sin saltar niveles.
- [ ] Imágenes: ¿tienen alt text descriptivo? ¿están comprimidas? ¿WebP?
- [ ] Internal linking: ¿hay links entre páginas relacionadas?
- [ ] Keyword en primer párrafo del contenido.
- [ ] Contenido > 300 palabras en páginas de servicio.
- [ ] Thin content: ¿hay páginas con < 100 palabras? consolidar o reescribir.

### Off-page

- [ ] Backlinks tóxicos: correr Ahrefs/Semrush. Disavow si > 5% spammy.
- [ ] Domain Rating / Authority: trackear mes a mes.
- [ ] Anchor text distribution: ¿hay over-optimization?
- [ ] Menciones de marca sin link: outreach para pedir link.
- [ ] Perfiles en directorios locales (Google Business, Yelp, etc.).

## Keyword research (mensual)

1. **Brainstorming**: 5-10 topics por servicio.
2. **Expansión**: usar Google Keyword Planner, Ahrefs, Semrush,
   AnswerThePublic, Google "People Also Ask".
3. **Clustering**: agrupar por intención (informacional, comercial,
   transaccional, navegacional).
4. **Priorización**: volume × difficulty × relevance × stage in funnel.
5. **Tracking**: cada keyword mapeada a una URL o a un contenido a crear.

## Monitoreo mensual

- Posición promedio de las top 20 keywords (Ahrefs / Semrush).
- Tráfico orgánico por landing page (Search Console + GA4).
- Nuevas keywords por las que aparecemos (Search Console > Rendimiento).
- CTR promedio de las top 50 páginas.
- Backlinks nuevos vs perdidos.

## Reglas

- **No** keyword stuffing ni anchors exactos antinaturales.
- **Sí** contenido de calidad > 800 palabras para pillar pages.
- **Sí** E-E-A-T: mostrar experiencia, expertise, autoridad, confianza
  (autor identificable, fuentes citadas, HTTPS, contacto visible).
- **Sí** actualizar contenido top 10 cada 6 meses (freshness signal).
