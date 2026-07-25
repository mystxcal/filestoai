/**
 * FilesToAI File Tree Handler
 * Handles the directory tree functionality
 */

// ── Global state ──
let currentMaxSizeBytes = 100 * 1024; // synced from the slider

// ── Default extensions to ignore (pre-populated on init) ──
const DEFAULT_HIDE_EXTENSIONS = [
    // Images
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', '.bmp', '.tiff',
    // Compiled / binary
    '.pyc', '.exe', '.dll', '.so', '.o', '.obj', '.class', '.pdb',
    // Archives
    '.zip', '.tar', '.gz', '.rar', '.7z', '.jar', '.war',
    // Documents / rich media
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    // Source maps & minified
    '.map', '.min.js', '.min.css',
    // System / temp
    '.DS_Store', '.log', '.tmp', '.bak', '.cache', '.swp',
    // Fonts
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    // Media
    '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac',
    // Lock files (usually huge / not useful for LLMs)
    '.lock'
];

function initializeFileTree() {
    // Sync initial slider value
    currentMaxSizeBytes = parseInt($('#size-slider').val(), 10) * 1024;

    // Initialize tree event listeners
    resetTreeEventListeners();
    
    // Initialize extension filter
    initializeExtensionFilter();
    
    // Initialize extension hide functionality (with defaults)
    initializeExtensionHide();

    // Initialize quick controls
    $('#select-all').on('click', function() {
        // Only select files that are NOT oversized and NOT hidden via filter
        $('#file-tree .file:not(.hidden-ext)').each(function() {
            const checkbox = $(this).find('.file-checkbox');
            if (!$(this).hasClass('oversized')) {
                checkbox.prop('checked', true);
            }
        });
        // Select directory checkboxes that aren't hidden
        $('#file-tree .directory:not(.hidden-dir) > .dir-checkbox').prop('checked', true);
        updateSelectedCount();
    });

    $('#deselect-all').on('click', function() {
        $('#file-tree .file-checkbox, #file-tree .dir-checkbox').prop('checked', false);
        updateSelectedCount();
    });

    $('#expand-all').on('click', function() { expandAllFolders('#file-tree, #special-file-tree'); });
    
    $('#collapse-all').on('click', function() { collapseAllFolders('#file-tree, #special-file-tree'); });

    $(document).on('click', '#special-expand-all', function(e) {
        e.stopPropagation();
        expandAllFolders('#special-file-tree');
    });

    $(document).on('click', '#special-collapse-all', function(e) {
        e.stopPropagation();
        collapseAllFolders('#special-file-tree');
    });

    $(document).on('click', '#special-select-all', function(e) {
        e.stopPropagation();
        $('#special-file-tree .special-file-checkbox').prop('checked', true);
        $('#special-file-tree .dir-checkbox').prop('checked', true);
    });

    $(document).on('click', '#special-deselect-all', function(e) {
        e.stopPropagation();
        $('#special-file-tree .special-file-checkbox, #special-file-tree .dir-checkbox').prop('checked', false);
    });

    $(document).on('click', '#special-copy-selected', function(e) {
        e.stopPropagation();
        const btn = $(this);
        const icon = btn.find('i');
        const originalText = btn.html();

        const selectedPaths = [];
        $('#special-file-tree .special-file-checkbox:checked').each(function() {
            selectedPaths.push($(this).data('path'));
        });

        if (selectedPaths.length === 0) {
            showToast('Please select at least one file to copy', 'info');
            return;
        }

        // Swap briefly to loading state
        icon.removeClass('fa-paste').addClass('fa-spinner fa-spin');
        btn.prop('disabled', true);

        $.ajax({
            url: '/api/copy_file_native',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ paths: selectedPaths }),
            success: function(response) {
                if (response.error) {
                    showToast(response.error, 'error');
                } else {
                    showToast(response.message, 'success');
                    btn.html('<i class="fas fa-check"></i> Copied!');
                    setTimeout(() => {
                        btn.html(originalText);
                    }, 2000);
                }
            },
            error: function(error) {
                showToast("Could not copy files to clipboard.", 'error');
            },
            complete: function() {
                icon.removeClass('fa-spinner fa-spin').addClass('fa-paste');
                btn.prop('disabled', false);
            }
        });
    });

    // Initialize info section toggle
    initializeInfoSection();

    // Initialize settings section toggle
    initializeSettingsSection();

    // ── Size slider live-update ──
    $('#size-slider').on('input', function() {
        currentMaxSizeBytes = parseInt($(this).val(), 10) * 1024;
        applyOversizedState();
    });
}

// ── Apply oversized state to every file in the tree ──
function applyOversizedState() {
    $('#file-tree .file').each(function() {
        const checkbox = $(this).find('.file-checkbox');
        const fileSize = parseInt(checkbox.data('size'), 10) || 0;

        if (fileSize > currentMaxSizeBytes) {
            $(this).addClass('oversized');
            // If it was checked via mass-select, uncheck it
            // (individual manual checks are re-allowed via the click handler)
        } else {
            $(this).removeClass('oversized');
        }
    });
}

function initializeInfoSection() {
    // Set initial icon state based on content visibility
    const content = $('.info-content');
    const button = $('.toggle-info-button');
    if (content.is(':visible')) {
        button.html('<i class="fas fa-chevron-up"></i>');
    } else {
        button.html('<i class="fas fa-chevron-down"></i>');
    }
    
    $('.info-header').on('click', function() {
        const content = $(this).siblings('.info-content');
        const button = $(this).find('.toggle-info-button');
        const header = $(this).closest('.info-header');

        content.slideToggle(200, function() {
            const isVisible = content.is(':visible');
            if (isVisible) {
                button.html('<i class="fas fa-chevron-up"></i>');
                header.css('margin-bottom', '10px');
            } else {
                button.html('<i class="fas fa-chevron-down"></i>');
                header.css('margin-bottom', '0');
            }
        });
    });
}

function initializeSettingsSection() {
    const content = $('.settings-content');
    const button = $('.toggle-settings-button');
    if (content.is(':visible')) {
        button.html('<i class="fas fa-chevron-up"></i>');
    } else {
        button.html('<i class="fas fa-chevron-down"></i>');
    }
    
    $('.settings-header').on('click', function() {
        const content = $(this).siblings('.settings-content');
        const button = $(this).find('.toggle-settings-button');

        content.slideToggle(200, function() {
            const isVisible = content.is(':visible');
            if (isVisible) {
                button.html('<i class="fas fa-chevron-up"></i>');
            } else {
                button.html('<i class="fas fa-chevron-down"></i>');
            }
        });
    });
}

// ═══════════════════════════════════════════════════
//  Extension SELECTION filter
// ═══════════════════════════════════════════════════
function initializeExtensionFilter() {
    let activeExtensions = [];
    
    $('#extension-input').on('keypress', function(e) {
        if (e.which === 13) {
            e.preventDefault();
            addExtension();
        }
    });
    
    $('#add-extension').on('click', function() {
        addExtension();
    });
    
    $('#clear-extensions').on('click', function() {
        activeExtensions = [];
        renderExtensionPills();
        showToast('All extension filters cleared', 'info');
    });
    
    function addExtension() {
        let ext = $('#extension-input').val().trim();
        if (ext) {
            if (!ext.startsWith('.')) ext = '.' + ext;
            if (!activeExtensions.includes(ext)) {
                activeExtensions.push(ext);
                renderExtensionPills();
                showToast(`Added "${ext}" filter`, 'success');
                $('#extension-input').val('');
            } else {
                showToast(`"${ext}" is already in filters`, 'info');
            }
        }
    }
    
    // Handle globally delegated clicks for dynamically populated pills
    $(document).off('click', '.ext-pill-btn').on('click', '.ext-pill-btn', function() {
        const ext = $(this).data('ext');
        if (!activeExtensions.includes(ext)) {
            activeExtensions.push(ext);
            renderExtensionPills();
            showToast(`Added "${ext}" to selection list`, 'success');
        }
    });
    
    function renderExtensionPills() {
        const pillsContainer = $('#extension-pills');
        pillsContainer.empty();
        
        activeExtensions.forEach(ext => {
            const pill = $(`<span class="extension-pill">${ext}<span class="remove-ext"><i class="fas fa-times"></i></span></span>`);
            pillsContainer.append(pill);
            pill.find('.remove-ext').on('click', function() {
                activeExtensions = activeExtensions.filter(e => e !== ext);
                renderExtensionPills();
            });
        });
    }
    
    // Select files by extension – respects oversized & hidden state
    $('#apply-extension-selection').on('click', function() {
        if (activeExtensions.length === 0) {
            showToast('Please add at least one extension first', 'info');
            return;
        }
        selectFilesByExtension();
    });
    
    function selectFilesByExtension() {
        if (activeExtensions.length === 0) return;
        
        let selectedCount = 0;
        let skippedOversized = 0;
        
        $('#file-tree .file:visible').each(function() {
            const fileName = $(this).find('.file-name').text();
            const hasMatchingExt = activeExtensions.some(ext => 
                fileName.toLowerCase().endsWith(ext.toLowerCase())
            );

            if (hasMatchingExt) {
                // Skip oversized files in mass-select
                if ($(this).hasClass('oversized')) {
                    skippedOversized++;
                    return; // continue
                }
                const checkbox = $(this).find('.file-checkbox');
                if (!checkbox.prop('checked')) {
                    checkbox.prop('checked', true);
                    selectedCount++;
                }
            }
        });

        updateSelectedCount();

        if (selectedCount > 0) {
            let msg = `Selected ${selectedCount} additional files`;
            if (skippedOversized > 0) msg += ` (${skippedOversized} oversized skipped)`;
            showToast(msg, 'success');
        } else {
            let msg = 'No new files matched the extensions';
            if (skippedOversized > 0) msg += ` (${skippedOversized} oversized skipped)`;
            showToast(msg, 'info');
        }
    }
}

// ═══════════════════════════════════════════════════
//  Extension HIDE filter  (with default list)
// ═══════════════════════════════════════════════════
function initializeExtensionHide() {
    // Start with a copy of the defaults
    let hideExtensions = [...DEFAULT_HIDE_EXTENSIONS];

    // Render the default pills immediately
    renderHideExtensionPills();
    
    $('#extension-hide-input').on('keypress', function(e) {
        if (e.which === 13) {
            e.preventDefault();
            addHideExtension();
        }
    });
    
    $('#add-hide-extension').on('click', function() {
        addHideExtension();
    });
    
    $('#clear-hide-extensions').on('click', function() {
        hideExtensions = [];
        renderHideExtensionPills();
        showToast('All hide filters cleared', 'info');
    });
    
    function addHideExtension() {
        let ext = $('#extension-hide-input').val().trim();
        if (ext) {
            if (!ext.startsWith('.')) ext = '.' + ext;
            if (!hideExtensions.includes(ext)) {
                hideExtensions.push(ext);
                renderHideExtensionPills();
                showToast(`Added "${ext}" to hide list`, 'success');
                $('#extension-hide-input').val('');
            } else {
                showToast(`"${ext}" is already in hide list`, 'info');
            }
        }
    }
    
    // Quick-add buttons for dynamically generated hide extensions
    $(document).off('click', '.hide-ext-pill-btn').on('click', '.hide-ext-pill-btn', function() {
        const ext = $(this).data('ext');
        if (!hideExtensions.includes(ext)) {
            hideExtensions.push(ext);
            renderHideExtensionPills();
            showToast(`Added "${ext}" to hide list`, 'success');
        }
    });
    
    function renderHideExtensionPills() {
        const pillsContainer = $('#hide-extension-pills');
        pillsContainer.empty();
        
        hideExtensions.forEach(ext => {
            const pill = $(`<span class="extension-pill hide-pill">${ext}<span class="remove-ext"><i class="fas fa-times"></i></span></span>`);
            pillsContainer.append(pill);
            pill.find('.remove-ext').on('click', function() {
                hideExtensions = hideExtensions.filter(e => e !== ext);
                renderHideExtensionPills();
            });
        });
    }
    
    // Hide files by extension
    $('#apply-extension-hide').on('click', function() {
        if (hideExtensions.length === 0) {
            showToast('Please add at least one extension to hide', 'info');
            return;
        }
        hideFilesByExtension();
    });
    
    // Show all files
    $('#show-all-files').on('click', function() {
        showAllFiles();
    });
    
    // Expose hide function globally so we can call it after tree loads
    window._hideFilesByExtension = function() {
        hideFilesByExtension();
    };

    // Expose current hide list for external use
    window._getHideExtensions = function() {
        return hideExtensions;
    };

    window._syncHideExtensions = function(detectedExts) {
        // Keep user's manually added custom extensions
        const manualExts = hideExtensions.filter(e => !DEFAULT_HIDE_EXTENSIONS.includes(e));
        // Keep default extensions ONLY if they actually exist in the tree
        const validDefaultExts = hideExtensions.filter(e => DEFAULT_HIDE_EXTENSIONS.includes(e) && detectedExts.includes(e));

        hideExtensions = [...manualExts, ...validDefaultExts];
        renderHideExtensionPills();
    };
    function hideFilesByExtension() {
        if (hideExtensions.length === 0) return;
        
        let hiddenCount = 0;
        let deselectedCount = 0;
        
        $('#file-tree .file').each(function() {
            const fileName = $(this).find('.file-name').text();
            const hasMatchingExt = hideExtensions.some(ext => 
                fileName.toLowerCase().endsWith(ext.toLowerCase())
            );
            
            if (hasMatchingExt) {
                $(this).addClass('hidden-ext').hide();
                hiddenCount++;
                const checkbox = $(this).find('.file-checkbox');
                if (checkbox.prop('checked')) {
                    checkbox.prop('checked', false);
                    deselectedCount++;
                }
            } else {
                $(this).removeClass('hidden-ext').show();
            }
        });
        
        updateDirectoryVisibility();
        updateSelectedCount();
        
        // Update Status Badge
        $('#hide-filter-status').text('HIDING FILES').removeClass('badge-success').addClass('badge-warning');

        if (hiddenCount > 0) {
            let message = `Hidden ${hiddenCount} files from view`;
            if (deselectedCount > 0) {
                message += ` and deselected ${deselectedCount} files`;
            }
            showToast(message, 'success');
        } else {
            showToast('No files matched the extensions to hide', 'info');
        }
    }
    
    function showAllFiles() {
        $('#file-tree .file').removeClass('hidden-ext').show();
        $('#file-tree .directory').removeClass('hidden-dir').show();
        
        // Update Status Badge
        $('#hide-filter-status').text('SHOWING ALL').removeClass('badge-warning').addClass('badge-success');
        
        showToast('All files are now visible', 'info');
    }
    
    function updateDirectoryVisibility() {
        let directories = $('#file-tree .directory, #special-file-tree .directory').get().reverse();
        $(directories).each(function() {
            const dir = $(this);
            // Search for files that are NOT hidden by the extension filter
            const hasVisibleFiles = dir.find('.file:not(.hidden-ext)').length > 0;
            // Search for child directories that are NOT hidden by the extension filter
            const hasVisibleDirs = dir.find('.directory:not(.hidden-dir)').length > 0;
            
            if (hasVisibleFiles || hasVisibleDirs) {
                dir.removeClass('hidden-dir').show();
            } else {
                dir.addClass('hidden-dir').hide();
            }
        });
    }
}

function expandAllFolders(scope) {
    const selector = scope || '#file-tree, #special-file-tree';
    $(`${selector} .directory > ul`).show();
    $(`${selector} .expand-button`).each(function() {
        $(this).find('svg.fa-caret-right').removeClass('fa-caret-right').addClass('fa-caret-down');
        // Also handle cases where font-awesome hasn't replaced icons with SVGs yet
        $(this).find('i.fa-caret-right').removeClass('fa-caret-right').addClass('fa-caret-down');
    });
}

function collapseAllFolders(scope) {
    const selector = scope || '#file-tree, #special-file-tree';
    $(`${selector} .directory > ul`).hide();
    $(`${selector} .expand-button`).each(function() {
        $(this).find('svg.fa-caret-down').removeClass('fa-caret-down').addClass('fa-caret-right');
        // Also handle cases where font-awesome hasn't replaced icons with SVGs yet
        $(this).find('i.fa-caret-down').removeClass('fa-caret-down').addClass('fa-caret-right');
    });
}

function getPathignorePatterns() {
    const usePathignore = $('#pathignore-toggle').is(':checked');
    if (!usePathignore) return [];
    
    return $('#pathignore-input').val()
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '' && !line.startsWith('#'));
}

function testPathPatterns(patterns, path) {
    if (!patterns || patterns.length === 0) return false;
    
    for (const pattern of patterns) {
        if (!pattern || pattern.trim() === '' || pattern.trim().startsWith('#')) continue;
        
        let regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
            
        if (pattern.endsWith('/')) {
            regexPattern = `^(.*/)?(${regexPattern.slice(0, -1)})(/.*)?$`;
        } else {
            regexPattern = `^(.*/)?(${regexPattern})$`;
        }
        
        const regex = new RegExp(regexPattern);
        if (regex.test(path)) return true;
    }
    
    return false;
}

function resetTreeEventListeners() {
    $(document).off('click', '#file-tree .expand-button, #special-file-tree .expand-button');
    $(document).off('click', '#file-tree .directory-name, #special-file-tree .directory-name');
    $(document).off('change', '.dir-checkbox, .file-checkbox');
    $(document).off('click', '.copy-native-btn');
    $(document).off('click', '.open-file-btn');
    $(document).off('click', '.locate-file-btn');

    // Expand/collapse folder
    $(document).on('click', '#file-tree .expand-button, #special-file-tree .expand-button', function(event) {
        event.stopPropagation();
        event.preventDefault();
        
        let directoryItem = $(this).closest('.directory');
        let subtree = directoryItem.children('ul');
        let iconElement = $(this).find('svg');
        
        if (subtree.is(':visible')) {
            subtree.hide();
            if (iconElement.hasClass('fa-caret-down')) {
                iconElement.removeClass('fa-caret-down').addClass('fa-caret-right');
            }
        } else {
            subtree.show();
            if (iconElement.hasClass('fa-caret-right')) {
                iconElement.removeClass('fa-caret-right').addClass('fa-caret-down');
            }
        }
    });

    // Directory name click
    $(document).on('click', '#file-tree .directory-name, #special-file-tree .directory-name', function(event) {
        event.stopPropagation();
        $('.selected').removeClass('selected');
        $(this).addClass('selected');

        let expander = $(this).siblings('.expand-button');
        if (expander.length) {
            expander.trigger('click');
        }
    });

    // Checkbox change – respects oversized for directory propagation
    $(document).on('change', '.dir-checkbox, .file-checkbox', function(event) {
        event.stopPropagation();
        
        let isChecked = $(this).is(':checked');
        if ($(this).hasClass('dir-checkbox')) {
            // Propagate to children, but skip oversized files
            const dirLi = $(this).closest('.directory');
            dirLi.find('.dir-checkbox').prop('checked', isChecked);

            // Handle main file checkboxes
            dirLi.find('.file:not(.special-file)').each(function() {
                if (isChecked && $(this).hasClass('oversized')) {
                    // Don't auto-check oversized files
                    return;
                }
                $(this).find('.file-checkbox').prop('checked', isChecked);
            });

            // Handle special file checkboxes
            dirLi.find('.special-file-checkbox').prop('checked', isChecked);
        }

        updateSelectedCount();
    });

    // Handle OS-Native Copy to Clipboard for Special Media
    $(document).on('click', '.copy-native-btn', function(event) {
        event.stopPropagation();
        const btn = $(this);
        const path = btn.data('path');
        const icon = btn.find('i');

        // Swap briefly to loading state
        icon.removeClass('fa-copy fa-check text-success').addClass('fa-spinner fa-spin');
        btn.prop('disabled', true);

        $.ajax({
            url: '/api/copy_file_native',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ paths: [path] }),
            success: function(response) {
                if (response.error) {
                    showToast(response.error, 'error');
                    icon.removeClass('fa-spinner fa-spin').addClass('fa-copy');
                } else {
                    showToast(response.message, 'success');
                    // Show a quick success tick mark
                    icon.removeClass('fa-spinner fa-spin').addClass('fa-check text-success');
                    setTimeout(() => {
                        icon.removeClass('fa-check text-success').addClass('fa-copy');
                    }, 2000);
                }
            },
            error: function(error) {
                console.error("Copy Error:", error);
                showToast("Could not copy file to clipboard.", 'error');
                icon.removeClass('fa-spinner fa-spin').addClass('fa-copy');
            },
            complete: function() {
                btn.prop('disabled', false);
            }
        });
    });

    // Handle OS-Native Open File for Special Media
    $(document).on('click', '.open-file-btn', function(event) {
        event.stopPropagation();
        const btn = $(this);
        const path = btn.data('path');
        const icon = btn.find('i');

        icon.removeClass('fa-external-link-alt').addClass('fa-spinner fa-spin');

        $.ajax({
            url: '/api/open_file_native',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ path: path }),
            success: function(response) {
                if (response.error) {
                    showToast(response.error, 'error');
                } else {
                    showToast(response.message, 'success');
                }
            },
            complete: function() {
                icon.removeClass('fa-spinner fa-spin').addClass('fa-external-link-alt');
            }
        });
    });

    // Handle OS-Native Locate File in Explorer
    $(document).on('click', '.locate-file-btn', function(event) {
        event.stopPropagation();
        const btn = $(this);
        const path = btn.data('path');
        const icon = btn.find('i');

        icon.removeClass('fa-folder-open').addClass('fa-spinner fa-spin');

        $.ajax({
            url: '/api/locate_file_native',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ path: path }),
            success: function(response) {
                if (response.error) {
                    showToast(response.error, 'error');
                } else {
                    showToast(response.message, 'success');
                }
            },
            complete: function() {
                icon.removeClass('fa-spinner fa-spin').addClass('fa-folder-open');
            }
        });
    });
}

function updateSelectedCount() {
    const count = $('.file-checkbox:checked').length;
    $('#selected-count').text(count + (count === 1 ? ' file selected' : ' files selected'));
    
    if (count > 0) {
        $('#selected-count').addClass('selected');
    } else {
        $('#selected-count').removeClass('selected');
    }
}

// Called after tree loads to apply size limits + default hide
function postTreeLoadHook() {
    applyOversizedState();
    populateDynamicExtensions();
    // Auto-apply the default hide extensions
    if (window._getHideExtensions && window._getHideExtensions().length > 0) {
        window._hideFilesByExtension();
    }
}

// Dynamically generate Extension filters based on file tree contents
function populateDynamicExtensions() {
    const extCounts = {};
    $('#file-tree .file').each(function() {
        const fileName = $(this).find('.file-name').text();
        const lastDot = fileName.lastIndexOf('.');
        if (lastDot > 0) {
            const ext = $(this).find('.file-name').attr('data-ext');
            if (ext) {
                extCounts[ext] = (extCounts[ext] || 0) + 1;
            }
        }
    });

    const sortableExts = [];
    for (var ext in extCounts) {
        sortableExts.push([ext, extCounts[ext]]);
    }
    // Sort descending by frequency
    sortableExts.sort((a, b) => b[1] - a[1]);

    const selectExts = [];
    const hideExts = [];

    // Prioritize clean extensions
    const cleanExts = sortableExts.filter(e => !DEFAULT_HIDE_EXTENSIONS.includes(e[0]));
    const dirtyExts = sortableExts.filter(e => DEFAULT_HIDE_EXTENSIONS.includes(e[0]));

    // Fill Quick Select suggestions (up to 60)
    for (var i = 0; i < cleanExts.length && selectExts.length < 60; i++) {
        selectExts.push(cleanExts[i][0]);
    }
    for (var i = 0; i < dirtyExts.length && selectExts.length < 60; i++) {
        selectExts.push(dirtyExts[i][0]);
    }

    // Populate the Ignore list with ONLY detected junk
    for (var i = 0; i < dirtyExts.length; i++) {
        hideExts.push(dirtyExts[i][0]);
    }

    // Sync the active pill state to prune any defaults that don't exist here!
    if (window._syncHideExtensions) {
        window._syncHideExtensions(hideExts);
    }

    // Render Quick Select Suggestion Pills
    const selectContainer = $('#dynamic-select-extensions');
    selectContainer.empty();
    if (selectExts.length === 0) {
        selectContainer.html('<span class="text-muted" style="font-size: 0.8em; font-style: italic;">No standard extensions detected.</span>');
    } else {
        selectExts.forEach(ext => {
            selectContainer.append(`<button class="btn btn-sm btn-outline-secondary ext-pill-btn" data-ext="${ext}">${ext}</button> `);
        });
    }

    // Render Ignore Suggestions Pills
    const hideContainer = $('#dynamic-hide-extensions');
    hideContainer.empty();
    if (hideExts.length === 0) {
        hideContainer.html('<span class="text-muted" style="font-size: 0.8em; font-style: italic;">No common junk extensions detected.</span>');
    } else {
        hideExts.forEach(ext => {
            hideContainer.append(`<button class="btn btn-sm btn-outline-secondary hide-ext-pill-btn" data-ext="${ext}">${ext}</button> `);
        });
    }
}

// Note: showToast is defined in index.html inline script, not here
