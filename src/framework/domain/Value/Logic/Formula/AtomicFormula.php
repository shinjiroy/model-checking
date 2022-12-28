<?php

namespace Domain\Value\Logic\Formula;

use Closure;
use TypeError;

/**
 * 原子論理式
 */
class AtomicFormula implements Formula
{
    private Closure $func;

    /**
     * @param callable $func (any) => bool
     */
    public function __construct(callable $func)
    {
        $this->func = $func;
    }

    public function __invoke(...$args) : bool
    {
        $result = ($this->func)(...$args);
        if (!is_bool($result)) {
            throw new TypeError('論理式なのにbool値を返していません。');
        }
        return $result;
    }
}
