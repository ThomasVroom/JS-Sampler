// load web components
function init(data) {
    console.log("loaded data:", data);
    reset(); // clear results div

    // load presets
    const default_preset = "Presets";
    const all_presets_f = [default_preset, "All", "None"].concat([...new Set(data.f.flatMap(item => item.presets))].slice(1));
    const all_presets_m = [default_preset, "All", "None"].concat([...new Set(data.m.flatMap(item => item.presets))].slice(1));

    // selection logic
    const selected_f = data.f.map(item => item.name);
    const selected_m = data.m.map(item => item.name);
    const red = "rgb(200, 0, 0)";
    const green = "rgb(0, 200, 0)";
    function enable_name(element, is_f) {
        (is_f ? selected_f : selected_m).push(element.textContent);
        element.style.color = green;
    }
    function disable_name(element, is_f) {
        let i = (is_f ? selected_f : selected_m).indexOf(element.textContent);
        (is_f ? selected_f : selected_m).splice(i, 1);
        element.style.color = red;
    }
    function toggle_name(element, is_f) {
        (is_f ? selected_f : selected_m).indexOf(element.textContent) == -1 ? enable_name(element, is_f) : disable_name(element, is_f);
    }

    // add names to lists
    var f_list = document.getElementById("f-list");
    for (let i = 0; i < data.f.length; i++) {
        var li = document.createElement('li');
        li.appendChild(document.createTextNode(data.f[i].name));
        li.addEventListener("click", function() {toggle_name(this, true)});
        f_list.appendChild(li);
    }
    var m_list = document.getElementById("m-list");
    for (let i = 0; i < data.m.length; i++) {
        var li = document.createElement('li');
        li.appendChild(document.createTextNode(data.m[i].name));
        li.addEventListener("click", function() {toggle_name(this, false)});
        m_list.appendChild(li);
    }

    // preset logic
    function apply_preset(element, is_f) {
        var preset = element.value;
        if (preset == default_preset) return;

        // apply preset
        var list = is_f ? f_list : m_list;
        var d = is_f ? data.f : data.m;
        for (let i = 0; i < list.children.length; i++) {
            d[i].presets.includes(preset) ? enable_name(list.children[i], is_f) : disable_name(list.children[i], is_f);
        }

        // reset element
        element.value = default_preset;
    }

    // add presets
    var f_presets = document.getElementById("f-presets");
    for (let i = 0; i < all_presets_f.length; i++) {
        var option = document.createElement('option');
        option.appendChild(document.createTextNode(all_presets_f[i]));
        f_presets.appendChild(option);
    }
    f_presets.addEventListener("change", () => {apply_preset(f_presets, true)});
    var m_presets = document.getElementById("m-presets");
    for (let i = 0; i < all_presets_m.length; i++) {
        var option = document.createElement('option');
        option.appendChild(document.createTextNode(all_presets_m[i]));
        m_presets.appendChild(option);
    }
    m_presets.addEventListener("change", () => {apply_preset(m_presets, false)});

    // clear cache logic
    document.getElementById("clear-button").addEventListener("click", function() {
        var clear = confirm("Are you sure?");
        if (clear) {
            localStorage.removeItem("data");
            location.reload(); // refresh page
        }
    });

    // collapsibles logic
    var coll = document.getElementsByClassName("collapsible");
    for (let i = 0; i < coll.length; i++) {
        coll[i].addEventListener("click", function() {
            this.classList.toggle("active");
            var content = this.nextElementSibling;
            if (content.style.display === "grid") {
                content.style.display = "none";
            } else {
                content.style.display = "grid";
            }
        });
    }

    // add sampling logic
    var main_button = document.getElementById("main-button");
    main_button.addEventListener("click", function() {
        sample(data, selected_f, selected_m);
    });
    var reset_button = document.getElementById("reset-button");
    reset_button.addEventListener("click", reset);
    var complete_button = document.getElementById("complete-button");
    complete_button.addEventListener("click", function() {
        complete(data, selected_f, selected_m);
    });
}

// attempt to load existing data
var data = localStorage.getItem("data");
if (data) {
    init(JSON.parse(data));
}
else {
    // file reading logic
    document.getElementById("data-upload").addEventListener("change", function() {
        var file = this.files[0];
        if (!file.name.endsWith("data.json")) {
            alert("Incorrect file.");
            return;
        }

        // read file
        const reader = new FileReader();
        reader.onload = function() {
            data = JSON.parse(reader.result);
            localStorage.setItem("data", JSON.stringify(data));
            init(data);
        };
        reader.readAsText(file);
    });
}
