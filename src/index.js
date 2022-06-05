// styles
import "./styles/index.css";

// images
import pipeImage from "./images/pipe.png";
import marioGif from "./images/mario.gif";
import marioGameOverImage from "./images/game-over.png";
import cloudImage from "./images/clouds.png";

const gameBoard = document.querySelector(".game-board");

// create pipeELement
const pipeImageElement = document.createElement("img");
pipeImageElement.classList.add("pipe");
pipeImageElement.src = pipeImage;
gameBoard.append(pipeImageElement);

// create marioElement
const marioGifElement = document.createElement("img");
marioGifElement.classList.add("mario");
marioGifElement.src = marioGif;
gameBoard.append(marioGifElement);

// create cloudElement
const cloudElement = document.createElement("img");
cloudElement.classList.add("cloud");
cloudElement.classList.add ("cloud-animation")
cloudElement.src = cloudImage; 
gameBoard.append(cloudElement);

document.addEventListener("keydown", jump);

function jump() {
  marioGifElement.classList.add("jump");

  setTimeout(() => {
    marioGifElement.classList.remove("jump");
  }, 750);
}

setInterval(() => {
  const pipePosition = pipeImageElement.offsetLeft;
  const [marioPosition] = getComputedStyle(marioGifElement).bottom.split("px");
  const [cloudPosition] = getComputedStyle(cloudElement).right.split("px")

  if (
    pipePosition <= 120 &&
    pipePosition >= 17 &&
    parseInt(marioPosition) <= 80
  ) {
    pipeImageElement.style.animation = "none";
    pipeImageElement.style.left = `${pipePosition}px`;

    marioGifElement.src = marioGameOverImage;
    marioGifElement.style.bottom = `${marioPosition}px `;
    marioGifElement.classList.remove("jump");

    cloudElement.style.right = `${cloudPosition}px `
    cloudElement.classList.remove("cloud-animation")
  }
}, 10);
