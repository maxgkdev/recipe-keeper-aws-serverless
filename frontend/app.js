import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// --- YOUR API KEYS ---
const supabaseUrl = 'https://YOUR_SUPABASE_PROJECT.supabase.co';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);
const geminiApiKey = 'YOUR_GEMINI_API_KEY';

// --- REGISTER SERVICE WORKER FOR OFFLINE SUPPORT ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(() => console.log("Offline mode activated."))
    .catch(err => console.error("Offline mode failed:", err));
}

document.addEventListener('DOMContentLoaded', () => {
  
  // --- DOM ELEMENTS ---
  const navHome = document.getElementById('nav-home');
  const navUpload = document.getElementById('nav-upload');
  const viewHome = document.getElementById('view-home');
  const viewUpload = document.getElementById('view-upload');
  const viewDetail = document.getElementById('view-detail');
  const uploadForm = document.getElementById('upload-form');
  const photoInput = document.getElementById('recipe-photo');
  const stepsTextarea = document.getElementById('recipe-steps');
  const recipesContainer = document.getElementById('recipes-container');
  const categoryButtons = document.querySelectorAll('.category-card');

  const tabPhoto = document.getElementById('tab-photo');
  const tabLink = document.getElementById('tab-link');
  const sectionPhoto = document.getElementById('section-photo');
  const sectionLink = document.getElementById('section-link');

  const btnBack = document.getElementById('btn-back');
  const btnDelete = document.getElementById('btn-delete');
  const detailTitle = document.getElementById('detail-title');
  const detailImage = document.getElementById('detail-image');
  const detailCategory = document.getElementById('detail-category');
  const detailSteps = document.getElementById('detail-steps');
  const editPhotoInput = document.getElementById('edit-photo-input');

  // New Edit Text Elements
  const btnEditText = document.getElementById('btn-edit-text');
  const editStepsInput = document.getElementById('edit-steps-input');
  const btnSaveText = document.getElementById('btn-save-text');

  const btnRead = document.getElementById('btn-read');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const synth = window.speechSynthesis;

  // --- STATE VARIABLES ---
  let currentPhotoFile = null; 
  let currentCategoryFilter = null;
  let currentRecipeId = null;
  let currentRecipePhotoName = null;
  let currentUploadMode = 'photo'; 

  let availableVoices = [];
  let stepsArray = [];
  let currentStepIndex = 0;

  // --- NAVIGATION LOGIC ---
  navHome.classList.add('active');

  function switchView(target) {
    viewHome.classList.add('hidden');
    viewUpload.classList.add('hidden');
    viewDetail.classList.add('hidden');
    
    synth.cancel(); 

    if (target === 'home') {
      viewHome.classList.remove('hidden');
      navHome.classList.add('active');
      navUpload.classList.remove('active');
    } else if (target === 'upload') {
      viewUpload.classList.remove('hidden');
      navUpload.classList.add('active');
      navHome.classList.remove('active');
    } else if (target === 'detail') {
      viewDetail.classList.remove('hidden');
      navHome.classList.remove('active');
      navUpload.classList.remove('active');
    }
  }

  navHome.addEventListener('click', () => switchView('home'));
  navUpload.addEventListener('click', () => switchView('upload'));
  btnBack.addEventListener('click', () => switchView('home'));

  tabPhoto.addEventListener('click', () => {
    currentUploadMode = 'photo';
    tabPhoto.classList.add('active-tab');
    tabLink.classList.remove('active-tab');
    sectionPhoto.classList.remove('hidden');
    sectionLink.classList.add('hidden');
  });

  tabLink.addEventListener('click', () => {
    currentUploadMode = 'link';
    tabLink.classList.add('active-tab');
    tabPhoto.classList.remove('active-tab');
    sectionLink.classList.remove('hidden');
    sectionPhoto.classList.add('hidden');
  });

  // --- EDIT TEXT LOGIC ---
  if (btnEditText) {
    btnEditText.addEventListener('click', () => {
      detailSteps.classList.add('hidden');
      editStepsInput.value = detailSteps.textContent; 
      editStepsInput.classList.remove('hidden');
      btnEditText.classList.add('hidden');
      btnSaveText.classList.remove('hidden');
    });
  }

  if (btnSaveText) {
    btnSaveText.addEventListener('click', async () => {
      if (!navigator.onLine) {
        alert("You need an internet connection to edit the recipe text.");
        return;
      }

      const updatedText = editStepsInput.value.trim();
      const originalText = btnSaveText.textContent;
      btnSaveText.textContent = "Saving...";
      btnSaveText.disabled = true;

      try {
        const { error } = await supabase
          .from('recipes')
          .update({ steps: updatedText })
          .eq('id', currentRecipeId);

        if (error) throw error;

        // Update the screen instantly
        detailSteps.textContent = updatedText;
        
        // Re-calculate the speech reader steps
        stepsArray = updatedText.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 0);
        currentStepIndex = 0;
        const audioModeElement = document.querySelector('input[name="audio-mode"]:checked');
        const isContinuous = audioModeElement ? audioModeElement.value === 'continuous' : true;
        btnRead.textContent = isContinuous ? "🔊 Read All" : "🔊 Read Step 1";

        // Flip UI back to read-only mode
        editStepsInput.classList.add('hidden');
        detailSteps.classList.remove('hidden');
        btnSaveText.classList.add('hidden');
        btnEditText.classList.remove('hidden');

        // Refresh background cache
        loadRecipes();
        
      } catch (error) {
        console.error("Error updating text:", error);
        alert("Failed to save the updated text.");
      } finally {
        btnSaveText.textContent = originalText;
        btnSaveText.disabled = false;
      }
    });
  }

  // --- URL EXTRACTOR LOGIC ---
  const btnFetchUrl = document.getElementById('btn-fetch-url');
  const urlInput = document.getElementById('recipe-url');

  btnFetchUrl.addEventListener('click', async () => {
    if (!navigator.onLine) {
      alert("You need an internet connection to import a link.");
      return;
    }

    const url = urlInput.value.trim();
    if (!url) {
      alert("Please paste a link first.");
      return;
    }

    btnFetchUrl.textContent = "Loading...";
    btnFetchUrl.disabled = true;

    try {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      const proxyResponse = await fetch(proxyUrl);
      
      if (!proxyResponse.ok) throw new Error("Could not load the website.");
      const rawTextData = await proxyResponse.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(rawTextData, 'text/html');
      doc.querySelectorAll('script, style, header, footer, nav, sidebar, noscript, iframe').forEach(el => el.remove());
      const cleanPageText = doc.body.innerText || doc.body.textContent || "";
      const cleanRecipeText = cleanPageText.substring(0, 15000);

      const prompt = `
      You are a recipe extractor. Read the following website text and isolate the recipe context.
      Return ONLY a valid JSON object with these exact keys (do NOT include markdown backticks like \`\`\`json):
      "title": "The name of the recipe",
      "category": "Choose exactly one: breakfast, mains, desserts, or others",
      "steps": "The ingredients and instructions combined. You MUST use newline characters (\\n) to separate each ingredient and each step so it formats as a clean, beautiful list with line breaks."
      
      Website text content:
      ${cleanRecipeText}
      `;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Google API Error");

      let rawText = data.candidates[0].content.parts[0].text.trim();
      rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim(); 
      
      const recipeData = JSON.parse(rawText);

      document.getElementById('recipe-title').value = recipeData.title || "";
      document.getElementById('recipe-steps').value = recipeData.steps || "";
      
      const catSelect = document.getElementById('recipe-category');
      if (recipeData.category) {
        const matchingOption = catSelect.querySelector(`option[value="${recipeData.category.toLowerCase()}"]`);
        if (matchingOption) matchingOption.selected = true;
      }

    } catch (error) {
      console.error("URL Extraction Error:", error);
      alert("Could not extract the recipe automatically. The website might be blocking scrapers.");
    } finally {
      btnFetchUrl.textContent = "Auto-Fill";
      btnFetchUrl.disabled = false;
    }
  });

  // --- DELETE RECIPE LOGIC ---
  btnDelete.addEventListener('click', async () => {
    if (!navigator.onLine) {
      alert("You need an internet connection to delete recipes.");
      return;
    }

    const isConfirmed = confirm(`Are you sure you want to delete "${detailTitle.textContent}"? This cannot be undone.`);
    
    if (isConfirmed && currentRecipeId) {
      btnDelete.textContent = "Deleting...";
      try {
        await supabase.from('recipes').delete().eq('id', currentRecipeId);
        if (currentRecipePhotoName) {
           await supabase.storage.from('recipe-photos').remove([currentRecipePhotoName]);
        }
        switchView('home');
        loadRecipes(); 
      } catch (error) {
        console.error("Delete error:", error);
        alert("Failed to delete recipe.");
      } finally {
        btnDelete.textContent = "🗑️ Delete";
      }
    }
  });

  // --- EDIT/CHANGE PHOTO LOGIC ---
  editPhotoInput.addEventListener('change', async (e) => {
    if (!navigator.onLine) {
      alert("You need an internet connection to update the photo.");
      return;
    }

    const file = e.target.files[0];
    if (!file || !currentRecipeId) return;

    const label = document.querySelector('.btn-edit-photo');
    label.textContent = "⏳ Uploading...";

    try {
      const newFileName = `${Date.now()}_${file.name.replace(/\s+/g, '-')}`;
      const { error: uploadError } = await supabase.storage.from('recipe-photos').upload(newFileName, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('recipe-photos').getPublicUrl(newFileName);
      const newPhotoUrl = urlData.publicUrl;

      const { error: dbError } = await supabase.from('recipes')
        .update({ photo_url: newPhotoUrl, file_name: newFileName })
        .eq('id', currentRecipeId);
      if (dbError) throw dbError;

      if (currentRecipePhotoName) {
        await supabase.storage.from('recipe-photos').remove([currentRecipePhotoName]);
      }

      detailImage.src = newPhotoUrl;
      currentRecipePhotoName = newFileName;
      
      loadRecipes();

    } catch (error) {
      console.error("Error updating photo:", error);
      alert("Something went wrong while updating the photo.");
    } finally {
      label.textContent = "✏️ Change Photo";
    }
  });

  // --- HANDWRITING AI VISION LOGIC ---
  photoInput.addEventListener('change', async (e) => { 
    if (!navigator.onLine) {
      alert("You need an internet connection to scan handwriting.");
      return;
    }

    const file = e.target.files[0];
    if (file) {
      currentPhotoFile = file;
      
      const photoURL = URL.createObjectURL(file);
      let previewImg = document.getElementById('photo-preview');
      if (!previewImg) {
        previewImg = document.createElement('img');
        previewImg.id = 'photo-preview';
        previewImg.style.width = '100%';
        previewImg.style.marginTop = '12px';
        previewImg.style.borderRadius = '8px';
        previewImg.style.objectFit = 'cover';
        document.querySelector('.custom-file-upload').parentNode.appendChild(previewImg);
      }
      previewImg.src = photoURL;

      stepsTextarea.value = "AI is reading the handwriting... Please wait.";
      
      try {
        const base64Image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = error => reject(error);
        });

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
        
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "You are a recipe transcriber. Read the text in this image. Extract exactly what is written, preserving line breaks. Do not add any conversational filler, markdown formatting, or extra symbols." },
                { inline_data: { mime_type: file.type, data: base64Image } }
              ]
            }]
          })
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.error?.message || "Unknown Google API Error");

        if (data.candidates && data.candidates.length > 0) {
          stepsTextarea.value = data.candidates[0].content.parts[0].text.trim();
        } else {
          throw new Error("No text found by AI");
        }
      } catch (error) {
        console.error("AI Error:", error);
        stepsTextarea.value = "Couldn't read the image. You can type it in here manually.";
      }
    }
  });

  // --- UPLOAD SUBMIT LOGIC ---
  uploadForm.addEventListener('submit', async (e) => { 
    e.preventDefault(); 

    if (!navigator.onLine) {
      alert("You need an internet connection to save a new recipe.");
      return;
    }

    if (currentUploadMode === 'photo' && !currentPhotoFile) {
      alert("Please tap to open the camera and take a photo of the recipe.");
      return;
    }

    const title = document.getElementById('recipe-title').value;
    const category = document.getElementById('recipe-category').value;
    const steps = stepsTextarea.value; 
    const submitBtn = document.getElementById('btn-save-recipe');
    
    submitBtn.textContent = "Saving to Cloud...";
    submitBtn.disabled = true;

    try {
      let finalPhotoUrl = "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=400&q=80";
      let finalFileName = null;

      if (currentPhotoFile) {
        finalFileName = `${Date.now()}_${currentPhotoFile.name.replace(/\s+/g, '-')}`;
        const { error: uploadError = null } = await supabase.storage.from('recipe-photos').upload(finalFileName, currentPhotoFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('recipe-photos').getPublicUrl(finalFileName);
        finalPhotoUrl = urlData.publicUrl;
      }

      const { error: dbError } = await supabase.from('recipes').insert([{ 
            title: title, 
            category: category, 
            photo_url: finalPhotoUrl,
            steps: steps,
            file_name: finalFileName 
      }]);

      if (dbError) throw dbError;
      
      alert(`Success! "${title}" is securely saved.`);
      
      uploadForm.reset();
      currentPhotoFile = null;
      document.getElementById('recipe-url').value = ""; 
      const previewImg = document.getElementById('photo-preview');
      if (previewImg) {
        URL.revokeObjectURL(previewImg.src); 
        previewImg.remove();
      }
      
      switchView('home');
      loadRecipes();

    } catch (error) {
      console.error("Error saving recipe:", error);
      alert("Something went wrong while saving.");
    } finally {
      submitBtn.textContent = "Save Recipe";
      submitBtn.disabled = false;
    }
  });

  categoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedCategory = btn.dataset.category;
      if (currentCategoryFilter === selectedCategory) {
        currentCategoryFilter = null;
        btn.classList.remove('active-category');
      } else {
        currentCategoryFilter = selectedCategory;
        categoryButtons.forEach(b => b.classList.remove('active-category'));
        btn.classList.add('active-category');
      }
      loadRecipes();
    });
  });

  // --- OFFLINE/ONLINE FETCH & DISPLAY LOGIC ---
  function renderRecipeCards(recipesList) {
    recipesContainer.innerHTML = '';

    if (recipesList.length === 0) {
      recipesContainer.innerHTML = '<p style="color: var(--text-muted);">No recipes found.</p>';
      return;
    }

    recipesList.forEach(recipe => {
      const card = document.createElement('div');
      card.className = 'recipe-card-item';
      
      card.addEventListener('click', () => {
        currentRecipeId = recipe.id;
        currentRecipePhotoName = recipe.file_name;

        detailTitle.textContent = recipe.title;
        detailImage.src = recipe.photo_url;
        detailCategory.textContent = recipe.category;
        
        const rawText = recipe.steps || "No instructions provided.";
        detailSteps.textContent = rawText;
        
        // Safety Reset: Close the edit window if it was left open from a previous recipe
        if (btnEditText) {
          editStepsInput.classList.add('hidden');
          btnSaveText.classList.add('hidden');
          btnEditText.classList.remove('hidden');
          detailSteps.classList.remove('hidden');
        }
        
        stepsArray = rawText.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 0);
        currentStepIndex = 0;
        
        const audioModeElement = document.querySelector('input[name="audio-mode"]:checked');
        const isContinuous = audioModeElement ? audioModeElement.value === 'continuous' : true;
        btnRead.textContent = isContinuous ? "🔊 Read All" : "🔊 Read Step 1";
        
        switchView('detail');
        window.scrollTo(0, 0); 
      });

      card.innerHTML = `
        <img src="${recipe.photo_url}" alt="${recipe.title}">
        <div class="recipe-info">
          <h3>${recipe.title}</h3>
          <span>${recipe.category}</span>
        </div>
      `;
      recipesContainer.appendChild(card);
    });
  }

  async function loadRecipes() {
    recipesContainer.innerHTML = '<p style="color: var(--text-muted);">Loading recipes...</p>';

    if (navigator.onLine) {
      try {
        let query = supabase.from('recipes').select('*').order('id', { ascending: false });
        if (currentCategoryFilter) query = query.eq('category', currentCategoryFilter);
        
        const { data: recipes, error } = await query;
        if (error) throw error;

        if (!currentCategoryFilter) {
           localStorage.setItem('offlineRecipeBackup', JSON.stringify(recipes));
        }
        
        renderRecipeCards(recipes);
        return; 
      } catch (error) {
        console.error("Network failed, trying offline cache...", error);
      }
    }

    const backupData = localStorage.getItem('offlineRecipeBackup');
    if (backupData) {
      let cachedRecipes = JSON.parse(backupData);
      
      if (currentCategoryFilter) {
        cachedRecipes = cachedRecipes.filter(r => r.category === currentCategoryFilter);
      }
      
      renderRecipeCards(cachedRecipes);
      
      const offlineMsg = document.createElement('p');
      offlineMsg.style.color = '#F59E0B'; 
      offlineMsg.style.fontSize = '14px';
      offlineMsg.style.gridColumn = '1 / -1'; 
      offlineMsg.textContent = "⚠️ You are offline. Showing saved recipes.";
      recipesContainer.prepend(offlineMsg);
    } else {
      recipesContainer.innerHTML = '<p style="color: #EF4444;">No internet connection and no recipes saved offline.</p>';
    }
  }

  // --- AUDIO SYNTHESIS LOGIC ---
  function populateVoices() { availableVoices = synth.getVoices(); }
  populateVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) { speechSynthesis.onvoiceschanged = populateVoices; }

  function getBestVoice() {
    const premiumVoice = availableVoices.find(voice => 
      (voice.name.includes('Samantha') || voice.name.includes('Siri') || voice.name.includes('Google') || voice.name.includes('Premium')) && voice.lang.startsWith('en')
    );
    return premiumVoice || availableVoices.find(v => v.lang.startsWith('en')) || availableVoices[0];
  }

  btnRead.addEventListener('click', () => {
    if (synth.speaking && !synth.paused) return; 

    if (synth.paused) {
      synth.resume();
      return;
    }

    const audioModeElement = document.querySelector('input[name="audio-mode"]:checked');
    const isContinuous = audioModeElement ? audioModeElement.value === 'continuous' : true;

    if (isContinuous) {
      const textToRead = detailSteps.textContent;
      if (textToRead && textToRead !== "No instructions provided.") {
        const utterance = new SpeechSynthesisUtterance(textToRead);
        utterance.voice = getBestVoice();
        utterance.rate = 0.85; 
        synth.speak(utterance);
      }
    } else {
      if (stepsArray.length === 0) return;

      if (currentStepIndex < stepsArray.length) {
        const textToRead = stepsArray[currentStepIndex];
        const utterance = new SpeechSynthesisUtterance(textToRead);
        
        utterance.voice = getBestVoice();
        utterance.rate = 0.85; 
        
        utterance.onend = () => {
           currentStepIndex++;
           if (currentStepIndex < stepsArray.length) {
              btnRead.textContent = `🔊 Read Step ${currentStepIndex + 1}`;
           } else {
              btnRead.textContent = "🔊 Finished (Start Over)";
              currentStepIndex = 0; 
           }
        };

        synth.speak(utterance);
      }
    }
  });

  document.querySelectorAll('input[name="audio-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      synth.cancel(); 
      currentStepIndex = 0;
      btnRead.textContent = e.target.value === 'continuous' ? "🔊 Read All" : "🔊 Read Step 1";
    });
  });

  btnPause.addEventListener('click', () => {
    if (synth.speaking) synth.pause();
  });

  btnStop.addEventListener('click', () => {
    synth.cancel();
    currentStepIndex = 0;
    const audioModeElement = document.querySelector('input[name="audio-mode"]:checked');
    const isContinuous = audioModeElement ? audioModeElement.value === 'continuous' : true;
    btnRead.textContent = isContinuous ? "🔊 Read All" : "🔊 Read Step 1";
  });

  // Start app!
  loadRecipes();

});