import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
// @ts-ignore
import { decompressFrames, ParsedFrame, parseGIF } from 'gifuct-js';
import expandRange from './expandRange';
import process from './process';
import readImage from './readImage';

import 'bootstrap/dist/js/bootstrap.bundle.min';

type ANSIFrame = {
  ansiEscape: string;
  delay: number;
};

document.addEventListener('click', (event): void => {
  const eventTarget = event.target;

  if (!(eventTarget instanceof HTMLElement)) {
    return;
  }

  if (!eventTarget.matches('a.copy')) {
    return;
  }

  event.preventDefault();

  const target = eventTarget.dataset.clipboardTarget ?? null;

  if (!target) {
    return;
  }

  const contentElement = document.querySelector(target);

  if (!contentElement) {
    return;
  }

  navigator.clipboard.writeText((contentElement as HTMLElement).innerText);
});

const fileButton = document.querySelector('.parser .btn') as HTMLLabelElement,
  fileInput = fileButton.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement,
  urlContainer = document.querySelector('.url-container') as HTMLDivElement,
  urlInput = document.querySelector('input[type="url"]') as HTMLInputElement,
  errorContainer = document.querySelector('.error-container') as HTMLDivElement,
  errorContent = errorContainer.querySelector(
    '.error-content'
  ) as HTMLDivElement,
  optionsSection = document.querySelector('.options') as HTMLElement,
  coloursInputs = Array.from(
    document.querySelectorAll('input[name="colours"]')
  ) as HTMLInputElement[],
  maxHeightInput = document.querySelector(
    'input[name="maxHeight"]'
  ) as HTMLInputElement,
  maxWidthInput = document.querySelector(
    'input[name="maxWidth"]'
  ) as HTMLInputElement,
  unicodeInput = document.querySelector(
    'input[name="unicode"]'
  ) as HTMLInputElement,
  loopInputs = Array.from(
    document.querySelectorAll('input[name="loop"]')
  ) as HTMLInputElement[],
  [loopNRadio] = loopInputs,
  loopNInput = document.querySelector(
    'input[name="loop_n"]'
  ) as HTMLInputElement,
  loopNPlural = document.querySelector('.plural') as HTMLSpanElement,
  framesInput = document.querySelector(
    'input[name="frames"]'
  ) as HTMLInputElement,
  loadUrlLinks = document.querySelectorAll('a.load-url') as NodeList,
  terminal = new Terminal({
    convertEol: true,
    theme: {
      background: '#272822',
      cursor: 'transparent',
      foreground: '#f8f8f2',
    },
  }),
  fit = new FitAddon(),
  copyPaste = document.querySelector('pre.copy-paste code') as HTMLElement,
  animationDetails: {
    index: number;
    timeout: number | null;
  } = {
    index: 0,
    timeout: null,
  },
  displayError = (error: string = '') => {
    if (error === '') {
      errorContainer.classList.add('d-none');
      errorContent.innerText = '';

      return;
    }

    errorContainer.classList.remove('d-none');
    errorContent.innerText = error;
  },
  canvas = document.createElement('canvas') as HTMLCanvasElement,
  context = canvas.getContext('2d') as CanvasRenderingContext2D,
  processImage = (url: string, done: () => void = () => {}): Promise<void> =>
    fetch(url)
      .then((response) => response.arrayBuffer())
      .then((buffer) => parseGIF(buffer))
      .then((gif) => {
        canvas.height = gif.lsd.height;
        canvas.width = gif.lsd.width;

        return decompressFrames(gif, true);
      })
      .then((frames) => {
        if (framesInput.value === '') {
          framesInput.value = `1-${frames.length}`;
        }

        context.imageSmoothingEnabled = false;

        const requiredFrames = expandRange(framesInput.value),
          frameData = frames.map(
            (frame: ParsedFrame, index: number): ANSIFrame => {
              const frameCanvas = document.createElement(
                  'canvas'
                ) as HTMLCanvasElement,
                frameContext = frameCanvas.getContext(
                  '2d'
                ) as CanvasRenderingContext2D;

              frameCanvas.height = canvas.height;
              frameCanvas.width = canvas.width;

              const imageData = frameContext.createImageData(
                frame.dims.width,
                frame.dims.height
              );

              imageData.data.set(frame.patch);
              frameContext.putImageData(
                imageData,
                frame.dims.left,
                frame.dims.top
              );

              if (frame.disposalType === 2) {
                context.clearRect(0, 0, canvas.width, canvas.height);
              }

              context.drawImage(frameCanvas, 0, 0);

              // if the frame isn't required we can avoid calling `process` here, but we still need to run the above
              if (!requiredFrames.includes(index + 1)) {
                return {
                  ansiEscape: '',
                  delay: 0,
                };
              }

              const ansiEscape = process(canvas, {
                colours: coloursInputs.reduce((value: string, el) => {
                  if (el.checked) {
                    return el.value;
                  }

                  return value;
                }, '256'),
                maxHeight: parseInt(maxHeightInput.value, 10),
                maxWidth: parseInt(maxWidthInput.value, 10),
                unicode: unicodeInput.checked,
              });

              return {
                ansiEscape,
                delay: frame.delay,
              };
            }
          ),
          showFrame = () => {
            if (++animationDetails.index >= requiredFrames.length) {
              animationDetails.index = 0;
            }

            // terminal.reset();
            terminal.write(
              `\x1b[${
                (
                  frameData[
                    requiredFrames[animationDetails.index] - 1
                  ].ansiEscape.match(/\n/g) || []
                ).length * (unicodeInput.checked ? 1 : 2)
              }A`
            );
            terminal.write(
              frameData[requiredFrames[animationDetails.index] - 1].ansiEscape
            );

            animationDetails.timeout = setTimeout(
              showFrame,
              frameData[requiredFrames[animationDetails.index] - 1].delay
            );
          };

        if (animationDetails.timeout !== null) {
          clearTimeout(animationDetails.timeout);
          animationDetails.timeout = null;
          animationDetails.index = 0;
        }

        showFrame();

        terminal.resize(
          terminal.cols,
          (frameData[0].ansiEscape.match(/\n/g) || []).length + 1
        );

        copyPaste.innerText = `${frameData
          .reduce((frames: string[], frameData: ANSIFrame, index: number) => {
            if (requiredFrames.includes(index + 1)) {
              frames.push(
                `frame${index + 1}() {\nprintf "${frameData.ansiEscape.replace(
                  /\x1b/g,
                  '\\e'
                )}";\n}`
              );
            }

            return frames;
          }, [])
          .join('\n')}\n\n${
          loopNRadio.checked ? `i=${loopNInput.value};\n` : ''
        }while ${loopNRadio.checked ? `((i--))` : 'true'}; do\n${requiredFrames
          .map(
            (index) =>
              `frame${index};\nsleep ${
                frameData[index - 1].delay / 1000
              };\nprintf '\\e[${
                (frameData[index - 1].ansiEscape.match(/\n/g) || []).length *
                (unicodeInput.checked ? 1 : 2)
              }A';`
          )
          .join('\n\n')}\ndone\n`;

        displayError('');
      })
      .catch((e) => {
        displayError(e.message);
      })
      .finally(done),
  generate = () => {
    const file = fileInput?.files?.[0],
      url = urlInput.value,
      done = () =>
        [fileButton, urlContainer, optionsSection].forEach((el) =>
          el.classList.remove('loading')
        );

    terminal.clear();

    if (animationDetails.timeout !== null) {
      clearTimeout(animationDetails.timeout);
      animationDetails.timeout = null;
      animationDetails.index = 0;
    }

    requestAnimationFrame(() =>
      [fileButton, urlContainer, optionsSection].forEach((el) =>
        el.classList.add('loading')
      )
    );

    if (file) {
      return readImage(file)
        .then((url) => processImage(url, done))
        .catch((e) => displayError(e.message));
    }

    if (url) {
      return processImage(url, done);
    }

    return new Promise((resolve) => resolve(requestAnimationFrame(done)));
  };

terminal.loadAddon(fit);
terminal.open(document.querySelector('div.terminal') as HTMLDivElement);

fit.fit();

fileInput.addEventListener('input', () => {
  framesInput.value = '';
  urlInput.value = '';
});

urlInput.addEventListener('input', (event) => {
  if (!urlInput.reportValidity() || urlInput.value === '') {
    event.stopImmediatePropagation();

    return;
  }

  framesInput.value = '';
  fileInput.value = '';
});

loopNRadio.addEventListener('focus', () => loopNInput.focus());

loopNInput.addEventListener('input', () => {
  if (parseInt(loopNInput.value, 10) === 1) {
    loopNPlural.classList.add('d-none');

    return;
  }

  loopNPlural.classList.remove('d-none');

  if (!loopNRadio.checked) {
    loopNRadio.checked = true;
  }
});

framesInput.addEventListener('change', () => {
  requestAnimationFrame(() =>
    [fileButton, urlContainer, optionsSection].forEach((el) =>
      el.classList.add('loading')
    )
  );

  generate();
});

framesInput.addEventListener('keydown', ({ key }) => {
  if (key === 'Enter') {
    requestAnimationFrame(() =>
      [fileButton, urlContainer, optionsSection].forEach((el) =>
        el.classList.add('loading')
      )
    );

    generate();
  }
});

[
  fileInput,
  urlInput,
  unicodeInput,
  ...coloursInputs,
  maxWidthInput,
  maxHeightInput,
  ...loopInputs,
  loopNInput,
].forEach((input) =>
  input.addEventListener('input', ({ target }) => {
    generate().then(() => {
      if (target === urlInput) {
        urlInput.focus();
      }
    });
  })
);

loadUrlLinks.forEach((link) =>
  link.addEventListener('click', (event) => {
    event.preventDefault();

    const { url, colours } = (link as HTMLAnchorElement).dataset;

    urlInput.value = url ?? '';
    coloursInputs.forEach((input) => {
      if (input.value === colours) {
        input.checked = true;
      }
    });

    generate();
  })
);
