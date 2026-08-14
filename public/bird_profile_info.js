(() => {
  const p = new URLSearchParams(location.search);
  const params = {
    speciesCode: p.get('speciesCode') || '',
    commonName: p.get('commonName') || '',
    scientificName: p.get('scientificName') || ''
  };

  const topics = [
    ['migrationStatus', 'Migration'],
    ['breeding', 'Breeding'],
    ['dietFeeding', 'Diet & Feeding'],
    ['behavior', 'Behavior'],
    ['identification', 'Identification'],
    ['rangeHabitat', 'Range & Habitat'],
    ['classification', 'Classification'],
    ['conservation', 'Conservation']
  ];

  const container = document.getElementById('birdInfoSections');
  const status = document.getElementById('aboutStatus');
  const badge = document.getElementById('conservationBadge');

  let profileData = null;
  let activeButton = null;
  const keptTopics = new Map();
  const topicButtons = new Map();

  function normalizeConservationStatus(value='') {
    const raw = String(value || '')
      .replace(/\s*\([^)]*iucn[^)]*\)\s*/gi, ' ')
      .replace(/\s*[-–—]\s*iucn.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (raw.includes('critically endangered')) return 'Critically Endangered';
    if (raw.includes('endangered')) return 'Endangered';
    if (raw.includes('extinct in the wild')) return 'Extinct in the Wild';
    if (raw === 'extinct' || raw.includes('globally extinct')) return 'Extinct';
    if (raw.includes('vulnerable')) return 'Vulnerable';
    if (raw.includes('near threatened')) return 'Near Threatened';
    if (raw.includes('least concern')) return 'Least Concern';
    return String(value || '').trim();
  }

  function badgeClass(value='') {
    const s = normalizeConservationStatus(value).toLowerCase();
    if (s === 'least concern') return 'conservation-low';
    if (s === 'near threatened' || s === 'vulnerable') return 'conservation-medium';
    if (s.includes('endangered') || s.includes('extinct')) return 'conservation-high';
    return 'conservation-unknown';
  }

  function section(title, text, className='') {
    const node = document.createElement('section');
    node.className = 'bird-info-section' + (className ? ` ${className}` : '');
    const h = document.createElement('h3');
    h.textContent = title;
    const body = document.createElement('p');
    body.textContent = text;
    node.append(h, body);
    return { node, body };
  }

  function setButtonsEnabled(enabled) {
    for (const button of topicButtons.values()) {
      button.disabled = !enabled;
    }
  }

  function buildShell() {
    container.innerHTML = '';
    status.hidden = false;
    status.className = 'bird-info-loading';
    status.textContent = 'Preparing bird information…';

    const overview = section('Overview', '', 'bird-info-overview');
    overview.node.id = 'birdInfoOverview';
    overview.body.hidden = true;
    container.appendChild(overview.node);

    const detail = document.createElement('div');
    detail.id = 'birdInfoDetail';
    detail.className = 'bird-info-detail';
    container.appendChild(detail);

    const prompt = document.createElement('div');
    prompt.className = 'bird-topic-prompt';
    prompt.textContent = 'Explore more about this bird';
    container.appendChild(prompt);

    const buttons = document.createElement('div');
    buttons.className = 'bird-topic-buttons';

    for (const [key, label] of topics) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bird-topic-button';
      button.textContent = label;
      button.disabled = true;
      button.addEventListener('click', () => showTopic(key, label, button));
      topicButtons.set(key, button);
      buttons.appendChild(button);
    }

    container.appendChild(buttons);
  }

  function renderConservationBadge(c = {}) {
    if (!c.status) return false;

    const cleanStatus = normalizeConservationStatus(c.status);
    if (!cleanStatus) return false;

    badge.textContent = `${cleanStatus} (IUCN)`;
    badge.className = `conservation-badge ${badgeClass(cleanStatus)}`;
    badge.hidden = false;

    let source = document.getElementById('conservationSource');
    if (!source) {
      source = document.createElement('div');
      source.id = 'conservationSource';
      source.className = 'conservation-source';
      source.textContent = 'Source: IUCN Global Assessment';
      badge.insertAdjacentElement('afterend', source);
    }

    return true;
  }

  function conservationText(c = {}) {
    const bits = [];
    if (c.status) bits.push(`Status: ${c.status}`);
    if (c.populationTrend) bits.push(`Population trend: ${c.populationTrend}`);
    if (c.threats) bits.push(`Main threats: ${c.threats}`);
    if (c.howToHelp) bits.push(`How you can help: ${c.howToHelp}`);
    return bits.join('\n\n');
  }

  async function loadProfileOnce() {
    const qs = new URLSearchParams(params);
    const response = await fetch('/api/species-profile/about?' + qs.toString());
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Bird information unavailable.');
    }

    return data.profile || {};
  }

  async function initializeProfile() {
    const overviewNode = document.getElementById('birdInfoOverview');
    const overviewBody = overviewNode.querySelector('p');

    try {
      profileData = await loadProfileOnce();

      const overview = String(profileData.overview || '').trim();
      if (overview) {
        overviewBody.hidden = false;
        overviewBody.className = '';
        overviewBody.textContent = overview;
      } else {
        overviewNode.remove();
      }

      renderConservationBadge(profileData.conservation || {});

      status.hidden = false;
      status.className = 'bird-info-ready';
      status.textContent = 'Bird information ready';
      setButtonsEnabled(true);
    } catch (_) {
      overviewBody.className = '';
      overviewBody.textContent = 'Overview is temporarily unavailable.';
      status.hidden = false;
      status.className = 'error-box';
      status.textContent = 'Bird information is temporarily unavailable. Please try again later.';
      setButtonsEnabled(false);
    }
  }

  function showTopic(key, label, button) {
    if (!profileData) return;

    if (activeButton) activeButton.classList.remove('active');
    activeButton = button;
    button.classList.add('active');

    let text = '';
    if (key === 'conservation') {
      text = conservationText(profileData.conservation || {});
    } else {
      text = String(profileData[key] || '').trim();
    }

    const detail = document.getElementById('birdInfoDetail');
    const current = section(
      label,
      text || 'No additional information is currently available for this topic.'
    );

    if (text) {
      const keep = document.createElement('button');
      keep.type = 'button';
      keep.className = 'bird-info-keep';
      keep.textContent = keptTopics.has(key) ? 'Kept on profile' : 'Keep on profile';
      keep.disabled = keptTopics.has(key);
      keep.addEventListener('click', () => keepTopic(key, label, text, keep));
      current.node.appendChild(keep);
    }

    detail.replaceChildren(current.node);
  }

  function keepTopic(key, label, text, button) {
    if (keptTopics.has(key)) return;

    keptTopics.set(key, text);
    const detail = document.getElementById('birdInfoDetail');
    const kept = section(label, text, 'bird-info-kept');
    kept.node.dataset.topic = key;
    container.insertBefore(kept.node, detail);

    button.textContent = 'Kept on profile';
    button.disabled = true;
    detail.replaceChildren();
  }

  buildShell();
  initializeProfile();
})();
