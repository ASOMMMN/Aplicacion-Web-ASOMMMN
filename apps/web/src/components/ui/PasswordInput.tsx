'use client';

import { forwardRef, useState } from 'react';
import { Form, InputGroup, Button } from 'react-bootstrap';
import type { FormControlProps } from 'react-bootstrap';

const PasswordInput = forwardRef<HTMLInputElement, FormControlProps>(
  (props, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <InputGroup hasValidation>
        <Form.Control {...props} ref={ref} type={visible ? 'text' : 'password'} />
        <Button
          variant="outline-secondary"
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          <i className={visible ? 'bi bi-eye-slash' : 'bi bi-eye'} />
        </Button>
      </InputGroup>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

export default PasswordInput;
