<?php

namespace Domain\Value\Logic\Formula;

/**
 * 論理式の二項演算
 */
abstract class BinaryOperation implements Formula
{
    protected Formula $fml1;
    protected Formula $fml2;

    /**
     * $fml1 or $fml2
     *
     * @param Formula $fml1
     * @param Formula $fml2
     */
    public function __construct(Formula $fml1, Formula $fml2)
    {
        $this->fml1 = $fml1;
        $this->fml2 = $fml2;
    }

    /**
     * 2つの論理式の判定結果を元にした最終的な判定結果を返す
     *
     * @param boolean $result1
     * @param boolean $result2
     * @return boolean
     */
    abstract protected function judge(bool $result1, bool $result2) : bool;

    public function __invoke(...$args) : bool
    {
        $result1 = ($this->fml1)(...($args[0] ?? []));
        $result2 = ($this->fml2)(...($args[1] ?? []));
        // 原子論理式の時点で2つともbool値を返すことは保証されている
        return $this->judge($result1, $result2);
    }
}
