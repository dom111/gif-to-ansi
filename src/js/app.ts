import readImage from './readImage';
import process from './process';
// @ts-ignore
import { decompressFrames, ParsedFrame, parseGIF } from 'gifuct-js';
import expandRange from './expandRange';

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
  terminalPreview = document.querySelector('pre.terminal') as HTMLPreElement,
  copyPaste = document.querySelector('pre.copy-paste code') as HTMLElement,
  // animationDetails: {
  //   index: number;
  //   timeout: number | null;
  // } = {
  //   index: 0,
  //   timeout: null,
  // },
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
              if (!requiredFrames.includes(index + 1)) {
                return {
                  ansiEscape: '',
                  delay: 0,
                };
              }

              const frameCanvas = document.createElement(
                  'canvas'
                ) as HTMLCanvasElement,
                frameContext = frameCanvas.getContext(
                  '2d'
                ) as CanvasRenderingContext2D;

              frameCanvas.height = frame.dims.height;
              frameCanvas.width = frame.dims.width;

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
          );
        // TODO: this is horribly inefficient, mostly because of the re-render of terminal-preview... Investigating...
        // ,
        // showFrame = () => {
        //     if (++animationDetails.index >= requiredFrames.length) {
        //         animationDetails.index = 0;
        //     }
        //
        //     const previous = document.querySelector('.terminal.clone:not([class~="d-none"])') as HTMLPreElement,
        //         current = document.querySelector(`.terminal.clone[data-frame="${requiredFrames[animationDetails.index]}"]`) as HTMLPreElement;
        //
        //     if (previous) {
        //         previous.classList.add('d-none');
        //
        //     }
        //
        //     if (! current) {
        //         return null;
        //     }
        //
        //     current.classList.remove('d-none');
        //
        //     return setTimeout(showFrame, frameData[requiredFrames[animationDetails.index] - 1].delay);
        // };

        // if (animationDetails.timeout !== null) {
        //   clearTimeout(animationDetails.timeout);
        //   animationDetails.index = 0;
        // }
        //
        // requiredFrames.forEach((index) => {
        //   const clonedTerm = terminalPreview.cloneNode(true) as HTMLPreElement;
        //
        //   clonedTerm.classList.add('clone', 'd-none');
        //   clonedTerm.dataset.frame = `${index}`;
        //   clonedTerm.innerHTML = frameData[index - 1].ansiEscape;
        //
        //   terminalPreview.after(clonedTerm);
        // });
        //
        // terminalPreview.classList.add('d-none');
        // animationDetails.timeout = showFrame();

        copyPaste.innerText = `${frameData
          .reduce((frames: string[], frameData: ANSIFrame, index: number) => {
            if (requiredFrames.includes(index + 1)) {
              frames.push(
                `frame${index + 1}() {\nprintf "${frameData.ansiEscape}";\n}`
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
                frameData[index - 1].ansiEscape.match(/\n/g || []).length
              }A';`
          )
          .join('\n\n')}\ndone\n`;

        terminalPreview.innerText = frameData[requiredFrames[0] - 1].ansiEscape;

        displayError('');

        // done();
      })
      .catch((e) => {
        displayError(e.message);
        // done();
      })
      .finally(done),
  generate = (done: () => void = () => {}) => {
    const file = fileInput?.files?.[0],
      url = urlInput.value;

    if (file) {
      readImage(file)
        .then((url) => processImage(url, done))
        .catch((e) => displayError(e.message));

      return;
    }

    if (url) {
      processImage(url, done);
    }

    done();
  };

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

  generate(() =>
    [fileButton, urlContainer, optionsSection].forEach((el) =>
      el.classList.remove('loading')
    )
  );
});

framesInput.addEventListener('keydown', ({ key }) => {
  if (key === 'Enter') {
    requestAnimationFrame(() =>
      [fileButton, urlContainer, optionsSection].forEach((el) =>
        el.classList.add('loading')
      )
    );

    generate(() =>
      [fileButton, urlContainer, optionsSection].forEach((el) =>
        el.classList.remove('loading')
      )
    );
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
    requestAnimationFrame(() =>
      [fileButton, urlContainer, optionsSection].forEach((el) =>
        el.classList.add('loading')
      )
    );

    generate(() => {
      [fileButton, urlContainer, optionsSection].forEach((el) =>
        el.classList.remove('loading')
      );

      if (target === urlInput) {
        urlInput.focus();
      }
    });
  })
);
