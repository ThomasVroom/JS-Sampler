// Fisher-Yates shuffle (in-place)
function shuffle(array) {
    let currentIndex = array.length;

    // while there remain elements to shuffle
    while (currentIndex != 0) {

        // pick a remaining element
        let randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // swap it with the current element
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
}

// samples a random element (weighted)
function weighted_sample(items) {
    // sum of weights
    const sum = items.map(item => item.weight).reduce((prev, next) => prev + next);

    // generate random number in [1, sum]
    var r = Math.floor(Math.random() * sum) + 1;

    // assign outcome based on weight
    var cntr = 0;
    for (let i = 0; i < items.length; i++) {
        cntr += items[i].weight;
        if (r <= cntr) { // outcome
            return items[i];
        }
    }
}

// weighted sample of dice items
function dice_sample(data, settings, sampling_args) {
    const items = data.dice[settings.dice]

    // ff rate
    var ff_sample = sampling_args.person.is_f && Math.random() < settings.ff_rate;

    // sample dice
    var d_sample = weighted_sample(items);
    var text = d_sample.text;
    if (typeof text !== "string") {
        text = sampling_args.person.is_f ? (ff_sample ? text.m : text.f) : text.m;
    }

    // modifier
    if (settings.modifier) {
        var m_sample = weighted_sample(data.modifiers[settings.modifier]).text;
        if (m_sample) {
            text += (" (" + m_sample + ")");
        }
    }

    // additional sampling
    var additional_samples = [];
    var n_samples = d_sample.add;
    if (settings.additional && n_samples > 0) {
        var do_not_sample = new Set((sampling_args.person.is_f ? data.f : data.m)[sampling_args.person.name].incompatible);
        do_not_sample.add(sampling_args.person.name); // cannot sample self

        // repeat for all elements
        var range = new Set();
        while (n_samples > 0) {
            range = sampling_args.person.is_f ? (ff_sample ? sampling_args.selected_f : sampling_args.selected_m) : sampling_args.selected_f
            range = range.difference(do_not_sample);
            if (range.size > 0) {
                var sampled = Array.from(range)[Math.floor(Math.random() * range.size)];
                do_not_sample.add(sampled); // exclude for same sample procedure
                additional_samples.push(sampled);
            }
            n_samples--;
        }
    }

    // return text and any additional samples of outcome
    return {"text": text, "additional": additional_samples};
}

// retrieve sampling parameters
function retrieve_settings() {
    let settings = {};
    settings.with_replacement = !String(document.getElementById("sampling-mode").value).startsWith("without");
    settings.group_size = document.getElementById("group-size").value;
    settings.no_repeats = String(document.getElementById("avoid-repeats").value) == "true";
    settings.dice = String(document.getElementById("dice").value);
    if (settings.dice == "none") settings.dice = null;
    settings.additional = String(document.getElementById("additional-sampling").value) == "true";
    settings.modifier = String(document.getElementById("modifier").value);
    if (settings.modifier == "none") settings.modifier = null;
    settings.ff_rate = parseInt(String(document.getElementById("ff-rate").value).slice(0, -1))/100;
    return settings;
}

var results = document.getElementById("results");
var current = {"pairing": null}; // keeps track of current pairings
var last = null; // previous pairing (for avoiding repeats)

// push results to div
function push_results(pairings, number, data, settings, selected_f, selected_m) {
    // collect members
    var members = [];
    var keys = Object.keys(pairings);
    for (let i = 0; i < keys.length; i++) {
        if (parseInt(keys[i].split(" ")[0]) == number) {
            members.push({'name': pairings[keys[i]], 'is_f': keys[i].split(" ")[1] == 'f'});
        }
    }
    shuffle(members); // add randomization

    // create HTML
    var frag = document.createDocumentFragment();
    var sub_frag = document.createElement('div');
    sub_frag.className = "sub-result";

    // title
    var title = document.createElement('div');
    title.className = "group-title";
    title.innerText = "Group " + number;
    sub_frag.appendChild(title);

    // add members
    var member_list = document.createElement('ul');
    member_list.className = "group-list";
    for (let i = 0; i < members.length; i++) {
        var m = document.createElement('li');
        m.className = members[i].is_f ? "f" : "m";
        m.innerText = members[i].name;
        member_list.appendChild(m);
    }
    sub_frag.appendChild(member_list);

    // add dice item
    if (settings.dice) {
        var dice_result = dice_sample(data, settings, {"person": members[0], "selected_f": selected_f, "selected_m": selected_m});
        var dice_item = document.createElement('div');
        dice_item.className = "dice-item";

        // convert to image if url
        if (dice_result.text.startsWith("https://")) {
            var image = document.createElement('img');
            image.className = "image";
            image.src = dice_result.text.split(" ")[0];
            sub_frag.appendChild(image);

            // remove url, keep modifier
            dice_result.text = dice_result.text.endsWith(")") ? dice_result.text.split(" ").slice(1).join(" ") : "";
        }
        dice_item.innerHTML = dice_result.text;

        // additional samples
        var addit = dice_result.additional;
        for (let i = 0; i < addit.length; i++) {
            if (i == 0) dice_item.innerHTML += " → ";
            dice_item.innerHTML += ("<span class=\""+(selected_f.has(addit[i]) ? "f" : "m")+"\">"+addit[i]+"</span>");
            if (i < addit.length - 1) dice_item.innerHTML += ", ";
        }
        sub_frag.appendChild(dice_item);
    }

    // push results
    frag.appendChild(sub_frag);
    results.appendChild(frag);
}

// reset logic
function reset() {
    current = {"pairing": null};
    results.innerText = ''; // clear results div
}

// main sampling logic
function sample(data, selected_f, selected_m) {
    // get settings
    const settings = retrieve_settings();

    // feed results if already computed
    if (!settings.with_replacement && current.pairing) {
        if (current.index <= current.n_groups) {
            push_results(current.pairing, current.index, data, settings, selected_f, selected_m);
            current.index++;
        }
        return;
    }

    // reset results
    reset();

    // allocate groups
    const possible_groups = Array.from({length: Math.ceil((selected_f.size + selected_m.size) / settings.group_size)}, (_, i) => i + 1);
    const alloc_f = new Array(possible_groups.length), alloc_m = new Array(possible_groups.length);
    var f_left = selected_f.size, m_left = selected_m.size;
    for (let i = 0, frac_f, frac_m; i < possible_groups.length; i++) {
        // dynamically allocate f
        frac_f = Math.round(f_left / (possible_groups.length - i));
        alloc_f[i] = frac_f;
        f_left -= frac_f;
        // greedily allocate m
        frac_m = settings.group_size - frac_f;
        alloc_m[i] = frac_m <= m_left ? frac_m : m_left;
        m_left -= alloc_m[i];
    }

    // assert allocation is valid
    if (f_left != 0 || m_left != 0) {
        alert("No allocation was found.");
        return;
    }

    // shuffle groups
    shuffle(possible_groups);
    possible_groups.sort((a, b) => { // sort by group size, then by balance
        let a_f = alloc_f[a - 1], a_m = alloc_m[a - 1], b_f = alloc_f[b - 1], b_m = alloc_m[b - 1];
        let r = (b_f + b_m) - (a_f + a_m);
        return r != 0 ? r : (a_f > a_m ? a_f / a_m : a_m / a_f) - (b_f > b_m ? b_f / b_m : b_m / b_f);
    });

    // variables and domains
    const domains = {};
    for (let i = 0, j, k; i < possible_groups.length; i++) {
        for (j = 1; j <= alloc_f[possible_groups[i] - 1]; j++) {
            k = (i + 1) + " f " + j
            domains[k] = Array.from(selected_f);
            shuffle(domains[k]);
        }
        for (j = 1; j <= alloc_m[possible_groups[i] - 1]; j++) {
            k = (i + 1) + " m " + j
            domains[k] = Array.from(selected_m);
            shuffle(domains[k]);
        }
    }
    const variables = Object.keys(domains);

    // other constraints
    function isValid(assignment, variable, value) {
        // 1. no repeats in group 1
        const current_group = parseInt(variable.split(" ")[0]);
        const last_group = last ? last[value] : -1;
        if (settings.no_repeats && current_group == 1 && last_group == 1) {
            return false;
        }
        if (settings.group_size == 1) return true; // next checks not needed

        var exact_match = true, sum = 0;
        const total = alloc_f[current_group - 1] + alloc_m[current_group - 1];
        const incompatibilities = (variable.split(" ")[1] == 'f' ? data.f : data.m)[value].incompatible;

        for (let i = 0, v, m; i < variables.length; i++) {
            v = variables[i];
            m = assignment[v];
            if (!m) continue; // not yet assigned
            if (parseInt(v.split(" ")[0]) == current_group) {
                // 2. incompatibilities
                if (incompatibilities.includes(m)) { // assumes incompatibilities are symmetric!
                    return false;
                }
                if (!last || last[m] != last_group) exact_match = false;
                if (++sum == total - 1) break; // finished group
            }
        }

        // 3. no group repeats
        if (!settings.with_replacement && settings.no_repeats && exact_match && sum > 0) {
            return false;
        }

        // assignment is valid
        return true;
    }

    // solve CSP for valid pairings
    function solveCSP(assignment) {
        // if all variables assigned -> solution found
        if (Object.keys(assignment).length == variables.length) {
            return assignment;
        }

        // pick next unassigned variable (MRV)
        const remaining = variables.filter(v => !(v in assignment));
        let next = null, n_best = Infinity, n;
        for (const v of remaining) {
            n = domains[v].length;
            if (n < n_best) {
                n_best = n;
                next = v;
            }
        }

        const is_f = next.split(" ")[1] == 'f';
        for (const value of domains[next]) {
            if (isValid(assignment, next, value)) {
                assignment[next] = value;

                // forward checking
                for (const v of remaining) {
                    if ((v.split(" ")[1] == 'f') == is_f) {
                        domains[v] = domains[v].filter(d => d != value);
                    }
                }

                // recursive call
                const result = solveCSP(assignment);
                if (result) return result;

                // backtrack
                delete assignment[next];
                for (const v of remaining) {
                    if ((v.split(" ")[1] == 'f') == is_f) {
                        domains[v].push(value);
                    }
                }
            }
        }

        // no solution
        return null;
    }
    const pairings = solveCSP({});

    // assert solution was found
    if (!pairings) {
        alert("No solution was found.");
        return;
    }

    // save results
    console.log(pairings);
    if (!settings.with_replacement) {
        current.pairing = pairings;
        current.index = 2;
        current.n_groups = possible_groups.length;
    }
    last = Object.fromEntries(Object.entries(pairings).map(([k, v]) => [v, parseInt(k.split(" ")[0])])); // member -> group

    // push result
    push_results(pairings, 1, data, settings, selected_f, selected_m);
}

// auto-complete logic
function complete(data, selected_f, selected_m) {
    // get settings
    const settings = retrieve_settings();

    if (!settings.with_replacement) {
        if (current.pairing) { // push all results
            for (; current.index <= current.n_groups; current.index++) {
                push_results(current.pairing, current.index, data, settings, selected_f, selected_m);
            }
        }
        else {
            sample(data, selected_f, selected_m);
            if (current.pairing) { // if sample was successful
                complete(data, selected_f, selected_m);
            }
        }
    }
}
