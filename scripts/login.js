const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

loginBtn.onclick = function(){

    loginForm.style.display = "block";
    registerForm.style.display = "none";

    loginBtn.classList.add("active");
    registerBtn.classList.remove("active");

}

registerBtn.onclick = function(){

    loginForm.style.display = "none";
    registerForm.style.display = "block";

    registerBtn.classList.add("active");
    loginBtn.classList.remove("active");

}
